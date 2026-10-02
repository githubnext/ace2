import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { hostname } from "node:os";

import type { ModelRef } from "@ace/channel/protocol";

import * as catalog from "./catalog";
import { hostedAuth, request } from "./client";
import { config } from "./config";
import { models as providers } from "./keys";
import { preference } from "./preferences";

const PREFERRED = ["anthropic/claude-opus-5-5", "openai/gpt-6-astra"];

export function parseModel(value: string): ModelRef {
	const split = value.indexOf("/");
	if (split < 1) throw new Error("A model is written provider/id, such as openai/gpt-6-astra");
	return { provider: value.slice(0, split), modelId: value.slice(split + 1) };
}

/** Models with credentials on this machine. */
export async function models(): Promise<ModelRef[]> {
	const registry = providers();
	const results = await Promise.allSettled(
		registry.getProviders().map((provider) => registry.getAvailable(provider.id)),
	);
	const available = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
	const failed = results.find((result) => result.status === "rejected");
	if (!available.length && failed?.status === "rejected") throw failed.reason;
	return available.map((m) => ({
		provider: m.provider,
		modelId: m.id,
	}));
}

export async function defaultModel(): Promise<ModelRef> {
	if (config.model) return parseModel(config.model);
	const available = new Set((await models()).map((m) => `${m.provider}/${m.modelId}`));
	const selected = preference();
	if (selected) {
		if (!available.has(`${selected.provider}/${selected.modelId}`)) {
			throw new Error(
				"The default model is unavailable. Open Settings to check its provider or choose another model.",
			);
		}
		return selected;
	}
	const chosen = PREFERRED.find((candidate) => available.has(candidate));
	if (!chosen) {
		throw new Error(
			"No model credentials found. Open Settings to add a provider key, or use ace key set.",
		);
	}
	return parseModel(chosen);
}

/** The Git top level containing `dir`. */
export function project(dir: string): string {
	const result = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
		encoding: "utf8",
	});
	if (result.status !== 0) throw new Error(`${dir} is not inside a Git repository`);
	return result.stdout.trim();
}

/** Hosted channels are always reachable; local ones run while their worker does. */
export function isRunning(id: string): boolean {
	return !!catalog.read(id).hosted || existsSync(catalog.paths(id).socket);
}

/** Create a channel on a hosting service, with this host as its workspace. */
export async function host(dir: string, model: ModelRef, name: string | undefined, url: string) {
	const record = catalog.create(dir, model, name, url.replace(/\/$/, ""));
	const response = await fetch(`${record.hosted}/channels/${record.id}`, {
		method: "POST",
		headers: await hostedAuth(),
		body: JSON.stringify({
			id: record.id,
			name: record.name,
			owner: record.owner,
			project: record.project,
			lanes: catalog.paths(record.id).lanes,
			model,
			workspace: `host:${hostname()}`,
		}),
	}).catch((error: Error) => new Response(error.message, { status: 502 }));
	if (!response.ok) {
		catalog.remove(record.id);
		throw new Error(`The hosting service refused the channel: ${await response.text()}`);
	}
	return record;
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
