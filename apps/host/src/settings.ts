import type { ModelRef } from "@ace/channel/protocol";

import { config } from "./config";
import { credential, forget, key, store } from "./keys";
import { models, parseModel } from "./manage";
import { isModel, preference, savePreference } from "./preferences";
import type { ProviderId, Settings } from "./protocol";

const providers = new Map(
	[
		["anthropic", {
			name: "Anthropic",
			key: "ANTHROPIC_API_KEY",
			url: "https://api.anthropic.com/v1/models?limit=1",
		}],
		["openai", { name: "OpenAI", key: "OPENAI_API_KEY", url: "https://api.openai.com/v1/models" }],
	] as const,
);

function provider(id: ProviderId) {
	const found = providers.get(id);
	if (!found) throw new Error("Choose Anthropic or OpenAI");
	return found;
}

export async function settings(): Promise<Settings> {
	const statuses = await Promise.all(
		[...providers].map(async ([id, { name, key }]) =>
			Object.assign(await credential(key), { id, name })
		),
	);
	let available: ModelRef[] = [];
	let error: string | undefined;
	try {
		available = await models();
	} catch (cause) {
		error = (cause as Error).message;
	}
	return {
		providers: statuses,
		model: preference(),
		modelOverride: config.model ? parseModel(config.model) : undefined,
		models: available,
		error,
	};
}

async function check(id: ProviderId, value: string): Promise<void> {
	const selected = provider(id);
	const headers: Record<string, string> = id === "anthropic"
		? { "x-api-key": value, "anthropic-version": "2023-06-01" }
		: { authorization: `Bearer ${value}` };
	let response: Response;
	try {
		response = await fetch(selected.url, {
			headers,
			signal: AbortSignal.timeout(10_000),
			redirect: "error",
		});
	} catch {
		throw new Error(`Could not reach ${selected.name}. Check your connection and try again.`);
	}
	// Provider errors can echo credentials. Only status codes leave the host.
	await response.body?.cancel();
	if (response.ok) return;
	if (response.status === 401) throw new Error(`${selected.name} rejected this API key.`);
	if (response.status === 403) {
		throw new Error(
			`${selected.name} denied access. Check this key's permissions for listing models.`,
		);
	}
	if (response.status === 429) {
		throw new Error(`${selected.name} is rate limiting requests. Try again shortly.`);
	}
	throw new Error(`${selected.name} could not check the key (HTTP ${response.status}). Try again.`);
}

export async function setKey(id: ProviderId, value: string): Promise<void> {
	const selected = provider(id);
	if (
		typeof value !== "string" || !value.trim() || value.length > 4096 || /[\r\n]/.test(value)
		|| value.includes("\0")
	) {
		throw new Error("Enter a valid API key");
	}
	value = value.trim();
	await check(id, value);
	try {
		await store(selected.key, value);
	} catch {
		throw new Error(
			`Could not save the ${selected.name} key. Unlock the keychain and allow Ace Helper, then retry.`,
		);
	}
}

export async function checkKey(id: ProviderId): Promise<void> {
	const selected = provider(id);
	const value = await key(selected.key);
	if (!value) throw new Error(`Add a ${selected.name} API key first.`);
	await check(id, value);
}

export async function removeKey(id: ProviderId): Promise<void> {
	const selected = provider(id);
	try {
		await forget(selected.key);
	} catch {
		throw new Error(
			`Could not remove the ${selected.name} key. Unlock the keychain and allow Ace Helper, then retry.`,
		);
	}
}

export async function setModel(model: ModelRef | null): Promise<void> {
	if (model !== null) {
		if (!isModel(model)) throw new Error("Choose a provider and model");
		const available = await models();
		if (
			!available.some((item) => item.provider === model.provider && item.modelId === model.modelId)
		) {
			throw new Error("This model is unavailable. Add its provider key first.");
		}
	}
	savePreference(model);
}
