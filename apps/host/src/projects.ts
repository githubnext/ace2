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
import { remote, REMOTES } from "./github";
import type { Project } from "./protocol";

type Checkout = { root: string; repo?: string };

/** Worktrees and remotes rarely move, and listings resolve every channel's checkout. */
const checkouts = new Map<string, Checkout>();

/**
 * A Git worktree belongs to its repository's main checkout, so lanes and other agents' worktrees
 * join that project instead of appearing as their own.
 */
export function checkout(path: string): Checkout {
	const known = checkouts.get(path);
	if (known) return known;
	const git = (args: string[]) => spawnSync("git", ["-C", path, ...args], { encoding: "utf8" });
	const worktrees = git(["worktree", "list", "--porcelain"]);
	const main = worktrees.status === 0 ? /^worktree (.+)$/m.exec(worktrees.stdout)?.[1] : undefined;
	const value: Checkout = { root: main || path };
	const remotes = git(REMOTES);
	const repo = remotes.status === 0 ? remote(remotes.stdout) : null;
	if (repo) value.repo = repo;
	checkouts.set(path, value);
	return value;
}

function project(path: string): Project {
	const { root, repo } = checkout(path);
	const value: Project = { path: root, name: repo?.split("/")[1] || basename(root) || root };
	if (repo) value.repo = repo;
	return value;
}

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
	const values = new Map<string, Project>();
	for (const path of new Set([...paths(), ...catalog.list().map((channel) => channel.project)])) {
		const value = project(path);
		values.set(value.path, value);
	}
	return [...values.values()];
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
	path = realpathSync(checkout(path).root);
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
	return project(path);
}
