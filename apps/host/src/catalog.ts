import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

import type { ModelRef } from "@ace/channel";

export type Listing = {
	id: string;
	name: string;
	owner: string;
	project: string;
	model: ModelRef;
	created: number;
	archived?: boolean;
	/** Base URL of the service hosting the channel; this host serves its workspace. */
	hosted?: string;
};

export const home = process.env.ACE_HOME || join(homedir(), ".local", "state", "ace");
const root = join(home, "channels");

function login(): string | undefined {
	const result = Bun.spawnSync(["tailscale", "status", "--json"], { stderr: "ignore" });
	if (!result.success) return;
	const status = JSON.parse(result.stdout.toString());
	return status.User?.[status.Self.UserID]?.LoginName;
}

/**
 * The local human, named by their Tailscale login so they are the same participant on every
 * host. Without Tailscale the host is single-user and the OS account name stands in.
 */
export const user = process.env.ACE_USER || login() || userInfo().username;

export function dir(id: string): string {
	return join(root, id);
}

export function paths(id: string) {
	const base = dir(id);
	return {
		base,
		record: join(base, "channel.json"),
		storage: join(base, "channel.sqlite"),
		socket: join(base, "channel.sock"),
		pid: join(base, "worker.pid"),
		log: join(base, "worker.log"),
		lanes: join(base, "lanes"),
	};
}

const WORDS = [
	[
		"amber",
		"brisk",
		"calm",
		"deft",
		"eager",
		"fair",
		"glad",
		"hazy",
		"keen",
		"lucid",
		"mellow",
		"nimble",
	],
	[
		"anchor",
		"beacon",
		"cedar",
		"delta",
		"ember",
		"fjord",
		"grove",
		"harbor",
		"ladder",
		"meadow",
		"orbit",
		"ridge",
	],
];

function pick(words: string[]): string {
	return words[randomBytes(1)[0] % words.length];
}

export function create(project: string, model: ModelRef, name?: string, hosted?: string): Listing {
	const names = new Set(list().map((record) => record.name));
	const random = () => `${pick(WORDS[0])}-${pick(WORDS[1])}`;
	let chosen = name || random();
	if (name && names.has(name)) throw new Error(`A channel named ${name} already exists`);
	while (names.has(chosen)) chosen = random();
	if (!/^[a-z0-9][a-z0-9-]*$/.test(chosen)) {
		throw new Error("A channel name must be lowercase kebab-case");
	}
	const record: Listing = {
		id: randomBytes(8).toString("hex"),
		name: chosen,
		owner: user,
		project,
		model,
		created: Date.now(),
		...(hosted ? { hosted } : {}),
	};
	const { base, record: file } = paths(record.id);
	mkdirSync(base, { recursive: true });
	writeFileSync(file, JSON.stringify(record, null, "\t"));
	return record;
}

/** Whether this host runs the channel. Ids arrive from peers, so only well-formed ones reach the disk. */
export function owns(id: string): boolean {
	return /^[0-9a-f]{16}$/.test(id) && existsSync(paths(id).record);
}

export function read(id: string): Listing {
	return JSON.parse(readFileSync(paths(id).record, "utf8"));
}

export function write(record: Listing): void {
	writeFileSync(paths(record.id).record, JSON.stringify(record, null, "\t"));
}

export function list(): Listing[] {
	if (!existsSync(root)) return [];
	return readdirSync(root)
		.filter((id) => existsSync(paths(id).record))
		.map(read)
		.sort((a, b) => a.created - b.created);
}

/** Resolve a channel by ID or name. */
export function find(ref: string): Listing {
	const records = list();
	const record = records.find((record) => record.id === ref)
		|| records.find((record) => record.name === ref);
	if (!record) throw new Error(`No channel ${ref}`);
	return record;
}

export function remove(id: string): void {
	rmSync(dir(id), { recursive: true, force: true });
}
