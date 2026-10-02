/**
 * The team's directory (services/directory): this host publishes its channels there and reads
 * everyone else's, so a channel stays listed while its host is asleep.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as catalog from "./catalog";
import { hostedAuth } from "./client";
import type { Listing } from "./protocol";

const HEARTBEAT = 30_000;

type Host = { name: string; login: string; address?: string; seen: number };

const config = join(catalog.home, "directory.json");

export function url(): string | undefined {
	if (process.env.ACE_DIRECTORY) return process.env.ACE_DIRECTORY;
	if (existsSync(config)) return JSON.parse(readFileSync(config, "utf8")).url;
}

export function configure(value: string | undefined): void {
	if (value) writeFileSync(config, JSON.stringify({ url: value.replace(/\/$/, "") }));
	else rmSync(config, { force: true });
}

let known: { hosts: Host[]; channels: Listing[] } = { hosts: [], channels: [] };

/** The directory's last answer; empty until it first responds or without a directory. */
export function read() {
	return known;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
	const base = url();
	if (!base) throw new Error("No directory; see ace directory");
	const response = await fetch(`${base}${path}`, {
		...init,
		headers: { ...(await hostedAuth()), ...init?.headers },
	});
	if (!response.ok) throw new Error(`The directory answered ${response.status}`);
	return response;
}

/**
 * Publish this host's channels, then refresh what the directory knows. `onChange` runs after each
 * refresh. Failures keep the last answer, so an unreachable directory never hides channels.
 */
export function watch(
	self: { name: string; login: string; address?: string },
	channels: () => Listing[],
	onChange: () => void,
) {
	let pending = false;
	const sync = async () => {
		if (!url() || pending) return;
		pending = true;
		try {
			await call(`/hosts/${encodeURIComponent(self.name)}`, {
				method: "PUT",
				body: JSON.stringify({ ...self, channels: channels() }),
			});
			known = await (await call("/")).json();
			onChange();
		} catch (error) {
			console.error(`Directory: ${(error as Error).message}`);
		} finally {
			pending = false;
		}
	};
	void sync();
	setInterval(() => void sync(), HEARTBEAT);
	return sync;
}
