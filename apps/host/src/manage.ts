import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { resolve } from "node:path";

import type { ModelRef } from "@ace/channel/protocol";
import { available, choose } from "@ace/channel/models";

import * as catalog from "./catalog";
import { hostedAuth, request } from "./client";
import { config } from "./config";
import { models as providers } from "./keys";
import { preference } from "./preferences";

export function parseModel(value: string): ModelRef {
	const split = value.indexOf("/");
	if (split < 1) throw new Error("A model is written provider/id, such as openai/gpt-6-astra");
	return { provider: value.slice(0, split), modelId: value.slice(split + 1) };
}

/** Models with credentials on this machine. */
export async function models(): Promise<ModelRef[]> {
	return available(providers());
}

export async function defaultModel(): Promise<ModelRef> {
	if (config.model) return parseModel(config.model);
	return preference() || choose(providers());
}

/** The Git top level containing `dir`. */
export function project(dir: string): string {
	dir = resolve(dir === "~" ? homedir() : dir.startsWith("~/") ? homedir() + dir.slice(1) : dir);
	const result = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
		encoding: "utf8",
	});
	if (result.error) throw new Error("Git is unavailable. Check This Mac in Settings.");
	if (result.status !== 0) throw new Error(`${dir} is not inside a Git repository`);
	return result.stdout.trim();
}

/** Hosted channels are always reachable; local ones run while their worker does. */
export function isRunning(id: string): boolean {
	return !!catalog.read(id).hosted || existsSync(catalog.paths(id).socket);
}

/** Create a channel on a hosting service, with this host as its workspace. */
export async function host(
	dir: string,
	model: ModelRef | undefined,
	name: string | undefined,
	url: string,
) {
	// Saving the record starts the workspace link, so the service must have the channel first.
	const record = catalog.draft(dir, model, name, url.replace(/\/$/, ""));
	const response = await fetch(`${record.hosted}/channels/${record.id}`, {
		method: "POST",
		headers: await hostedAuth(),
		body: JSON.stringify({
			version: 2,
			id: record.id,
			name: record.name,
			prefix: record.prefix,
			named: record.named,
			owner: record.owner,
			project: record.project,
			lanes: catalog.paths(record.id).lanes,
			model,
			workspace: `host:${hostname()}`,
		}),
	}).catch((error: Error) => new Response(error.message, { status: 502 }));
	if (!response.ok) {
		throw new Error(`The hosting service refused the channel: ${await response.text()}`);
	}
	return catalog.save(record);
}

export async function kill(id: string): Promise<void> {
	if (isRunning(id)) await request(id, { op: "kill" });
}

export async function archive(id: string, archived: boolean): Promise<catalog.Listing> {
	if (archived) await kill(id);
	const record = { ...catalog.read(id), archived };
	catalog.write(record);
	return record;
}

/** Removes the channel and its lane worktrees; lane branches stay in the project. */
export async function remove(id: string): Promise<void> {
	await kill(id);
	const { project, hosted } = catalog.read(id);
	if (hosted) {
		const response = await fetch(`${hosted}/channels/${id}`, {
			method: "DELETE",
			headers: await hostedAuth(),
		});
		if (!response.ok && response.status !== 404) {
			throw new Error(`The hosting service did not delete the channel: ${response.status}`);
		}
	}
	const lanes = catalog.paths(id).lanes;
	for (const lane of existsSync(lanes) ? readdirSync(lanes) : []) {
		spawnSync("git", ["-C", project, "worktree", "remove", "--force", `${lanes}/${lane}`]);
	}
	catalog.remove(id);
}
