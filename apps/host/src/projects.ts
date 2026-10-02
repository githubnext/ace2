import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import * as catalog from "./catalog";
import { config } from "./config";
import type { Project } from "./protocol";

function paths(): string[] {
	try {
		const value: unknown = JSON.parse(readFileSync(join(config.home, "projects.json"), "utf8"));
		if (!Array.isArray(value) || !value.every((path) => typeof path === "string")) {
			throw new Error("Ace's project list must contain folder paths");
		}
		return value;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

/** Existing CLI channels remain visible without having to open their projects again. */
export function list(): Project[] {
	return [...new Set([...paths(), ...catalog.list().map((channel) => channel.project)])]
		.map((path) => ({ path, name: basename(path) || path }));
}

/** Opening a folder must not require model credentials or create a channel. */
export function open(value: string): Project {
	const expanded = value === "~"
		? homedir()
		: value.startsWith("~/")
		? homedir() + value.slice(1)
		: value;
	let path = realpathSync(resolve(expanded));
	if (!statSync(path).isDirectory()) throw new Error("Choose a folder to open as a project");
	const git = spawnSync("git", ["-C", path, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
	if (git.status === 0) path = realpathSync(git.stdout.trim());
	const opened = paths();
	if (!opened.includes(path)) {
		mkdirSync(config.home, { recursive: true, mode: 0o700 });
		const temporary = join(config.home, `.projects-${randomUUID()}.json`);
		try {
			writeFileSync(temporary, `${JSON.stringify([...opened, path], null, "\t")}\n`, {
				mode: 0o600,
			});
			renameSync(temporary, join(config.home, "projects.json"));
		} finally {
			rmSync(temporary, { force: true });
		}
	}
	return { path, name: basename(path) || path };
}
