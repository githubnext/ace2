import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

import { failure, type Fields, type Level, type Log } from "@ace/channel";

export { failure };

import { home } from "./catalog";

export const dir = join(home, "logs");

const LIMIT = 10 * 1024 * 1024;
const KEEP = 4;

let file: string | undefined;
let base: Fields = {};
let size = 0;

/** Older files shift up one; `name.jsonl` is always the newest. */
function rotate(path: string) {
	for (let n = KEEP - 1; n >= 1; n--) {
		const from = n === 1 ? path : path.replace(/\.jsonl$/, `.${n - 1}.jsonl`);
		if (existsSync(from)) renameSync(from, path.replace(/\.jsonl$/, `.${n}.jsonl`));
	}
	size = 0;
}

/**
 * Names this process's log file, `logs/<name>.jsonl`, and the fields on every line. Each process
 * owns its own file, so lines never interleave mid-record and rotation needs no lock.
 */
export function open(name: string, fields: Fields = {}): void {
	mkdirSync(dir, { recursive: true });
	file = join(dir, `${name}.jsonl`);
	size = existsSync(file) ? statSync(file).size : 0;
	base = { proc: name, pid: process.pid, ...fields };
	// Lines written right before a crash are the ones that explain it, so writes are synchronous.
	process.on("uncaughtException", (error) => {
		log("error", "process.uncaught", failure(error));
		process.exit(1);
	});
	process.on("unhandledRejection", (error) => log("error", "process.unhandled", failure(error)));
	process.on("exit", (code) => log(code ? "error" : "debug", "process.exit", { code }));
}

export const log: Log = (level: Level, event: string, fields?: Fields) => {
	if (!file || (level === "debug" && !process.env.ACE_DEBUG)) return;
	const line = `${
		JSON.stringify({ t: new Date().toISOString(), level, event, ...base, ...fields })
	}\n`;
	if (size + line.length > LIMIT) rotate(file);
	appendFileSync(file, line);
	size += line.length;
};

/** Every log file, oldest rotation first, for `ace logs`. */
export function files(): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => name.endsWith(".jsonl")).map((name) => join(dir, name));
}
