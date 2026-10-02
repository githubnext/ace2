/**
 * Provider credentials. pi-ai asks for each by its usual environment name, such as
 * `OPENAI_API_KEY`; Ace answers from `ACE_<NAME>`, then `<NAME>`, then the OS keychain. The
 * keychain lets the desktop app, which starts without a shell's environment, find keys.
 */
import { access } from "node:fs/promises";
import { homedir } from "node:os";

import type { MutableModels } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const service = "ace";
const found = new Map<string, string | undefined>();

function set(value: string | undefined): string | undefined {
	return value?.trim() ? value : undefined;
}

async function keychain(name: string): Promise<string | undefined> {
	if (!found.has(name)) {
		found.set(name, set(await Bun.secrets.get({ service, name }).catch(() => null) ?? undefined));
	}
	return found.get(name);
}

export async function key(name: string): Promise<string | undefined> {
	return set(process.env[`ACE_${name}`]) ?? set(process.env[name]) ?? await keychain(name);
}

export function store(name: string, value: string): Promise<void> {
	found.delete(name);
	return Bun.secrets.set({ service, name, value });
}

export async function forget(name: string): Promise<boolean> {
	found.delete(name);
	return Bun.secrets.delete({ service, name });
}

/** pi-ai's built-in providers, resolving credentials through Ace. */
export function models(): MutableModels {
	return builtinModels({
		authContext: {
			env: key,
			async fileExists(path) {
				try {
					await access(path.startsWith("~") ? homedir() + path.slice(1) : path);
					return true;
				} catch {
					return false;
				}
			},
		},
	});
}
