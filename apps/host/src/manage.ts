import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { builtinModels } from "@earendil-works/pi-ai/providers/all";

import type { ModelRef } from "@ace/channel/protocol";

import * as catalog from "./catalog";
import { request } from "./client";

const PREFERRED = ["anthropic/claude-opus-5-5", "openai/gpt-6-astra"];

export function parseModel(value: string): ModelRef {
	const split = value.indexOf("/");
	if (split < 1) throw new Error("A model is written provider/id, such as openai/gpt-6-astra");
	return { provider: value.slice(0, split), modelId: value.slice(split + 1) };
}

/** Models with credentials on this machine. */
export async function models(): Promise<ModelRef[]> {
	return (await builtinModels().getAvailable()).map((m) => ({
		provider: m.provider,
		modelId: m.id,
	}));
}

export async function defaultModel(): Promise<ModelRef> {
	if (process.env.ACE_MODEL) return parseModel(process.env.ACE_MODEL);
	const available = new Set((await models()).map((m) => `${m.provider}/${m.modelId}`));
	const chosen = PREFERRED.find((candidate) => available.has(candidate));
	if (!chosen) {
		throw new Error(
			"No model credentials found; set OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --model",
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

export function isRunning(id: string): boolean {
	return existsSync(catalog.paths(id).socket);
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
	const { project } = catalog.read(id);
	const lanes = catalog.paths(id).lanes;
	for (const lane of existsSync(lanes) ? readdirSync(lanes) : []) {
		spawnSync("git", ["-C", project, "worktree", "remove", "--force", `${lanes}/${lane}`]);
	}
	catalog.remove(id);
}
