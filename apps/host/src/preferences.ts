import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ModelRef } from "@ace/channel/protocol";

import { config } from "./config";

export function isModel(value: unknown): value is ModelRef {
	return typeof value === "object" && value !== null && "provider" in value && "modelId" in value
		&& typeof value.provider === "string" && value.provider.length > 0
		&& typeof value.modelId === "string" && value.modelId.length > 0;
}

export function preference(): ModelRef | null {
	let text: string;
	try {
		text = readFileSync(join(config.settings, "settings.json"), "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	const value: unknown = JSON.parse(text);
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Ace settings must contain a settings object");
	}
	if (!("model" in value) || value.model === null) return null;
	if (!isModel(value.model)) throw new Error("The default model in Ace settings is invalid");
	return value.model;
}

export function savePreference(model: ModelRef | null): void {
	if (model !== null && !isModel(model)) throw new Error("Choose a provider and model");
	mkdirSync(config.settings, { recursive: true, mode: 0o700 });
	const temporary = join(config.settings, `.settings-${randomUUID()}.json`);
	try {
		writeFileSync(temporary, `${JSON.stringify({ model }, null, "\t")}\n`, { mode: 0o600 });
		renameSync(temporary, join(config.settings, "settings.json"));
	} finally {
		rmSync(temporary, { force: true });
	}
}
