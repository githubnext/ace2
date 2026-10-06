import type { Context } from "@earendil-works/chord";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";

import { git, quote } from "./git";
import type { Change, Changes } from "./protocol";

const FILES = 500;
const PATCH = 512 * 1024;
type Stat = Omit<Change, "version">;

/** Reads parse stdout, so their stderr is dropped; exec combines the two streams. */
const read = (env: ExecutionEnv, cwd: string, args: string, context: Context, ok?: number[]) =>
	git(env, `${args} 2>/dev/null`, context, { cwd, ...(ok ? { ok } : {}) });

/**
 * Lanes from before version 2 of `LanesDoc` recorded no base. They compare against origin's
 * default branch as last fetched, since a Diff refresh must not fetch, or against the project's
 * HEAD in a repository without origin.
 */
async function legacy(env: ExecutionEnv, cwd: string, project: string, context: Context) {
	const remotes = (await read(env, cwd, "remote", context)).split("\n");
	if (!remotes.includes("origin")) {
		return (await read(env, project, "rev-parse HEAD", context)).trim();
	}
	const ref = (await read(env, cwd, "symbolic-ref -q refs/remotes/origin/HEAD", context, [0, 1]))
		.trim();
	const commit = ref
		&& await read(env, cwd, `rev-parse -q --verify ${quote(`${ref}^{commit}`)}`, context, [0, 1]);
	if (commit) return ref;
	throw new Error(
		"origin's default branch is unknown locally. Run `git fetch origin` and `git remote set-head origin --auto` in the project, or switch to the lane with a base.",
	);
}

/**
 * The base a chat's work is measured against: where its lane forked from the lane's base, as a
 * pull request into that base would show it. The checkout itself compares to HEAD.
 */
async function base(
	env: ExecutionEnv,
	cwd: string,
	project: string,
	target: string | undefined,
	context: Context,
) {
	const head = (await read(env, cwd, "rev-parse HEAD", context)).trim();
	if (cwd === project) return { base: head, head };
	const against = target || await legacy(env, cwd, project, context);
	const fork = await read(env, cwd, `merge-base HEAD ${quote(against)}`, context).catch(() => {
		throw new Error(
			`Could not find where the lane forked from ${against}. Switch to the lane with another base.`,
		);
	});
	return { base: fork.trim(), head };
}

/** `adds\tdels\tpath\0`, or `adds\tdels\t\0from\0to\0` for a rename; binary files count `-`. */
function numstat(text: string): Stat[] {
	const fields = text.split("\0");
	const out: Stat[] = [];
	for (let i = 0; i < fields.length - 1; i++) {
		const [adds, dels, path] = fields[i]!.split("\t");
		const binary = adds === "-";
		const counts = { binary, adds: binary ? 0 : Number(adds), dels: binary ? 0 : Number(dels) };
		if (path) out.push({ file: path, ...counts });
		else {
			out.push({ file: fields[i + 2]!, from: fields[i + 1]!, ...counts });
			i += 2;
		}
	}
	return out;
}

async function untracked(env: ExecutionEnv, cwd: string, context: Context): Promise<Stat[]> {
	const files = (await read(env, cwd, "ls-files --others --exclude-standard -z", context))
		.split("\0").filter(Boolean).slice(0, FILES);
	return Promise.all(files.map(async (file) => {
		// --no-index exits 1 when the files differ, which they always do here.
		const stat = await read(
			env,
			cwd,
			`diff --no-index --numstat -z -- /dev/null ${quote(file)}`,
			context,
			[0, 1],
		);
		const [adds, dels] = stat.split("\t");
		const binary = adds === "-";
		return { file, binary, adds: binary ? 0 : Number(adds), dels: binary ? 0 : Number(dels) };
	}));
}

export async function changes(
	env: ExecutionEnv,
	cwd: string,
	project: string,
	lane: { name: string; base?: string } | undefined,
	context: Context,
): Promise<Changes> {
	const range = await base(env, cwd, project, lane?.base, context);
	const branch = (await read(env, cwd, "rev-parse --abbrev-ref HEAD", context)).trim();
	const tracked = numstat(await read(env, cwd, `diff -M --numstat -z ${range.base}`, context));
	const files = await Promise.all(
		[...tracked, ...await untracked(env, cwd, context)].slice(0, FILES).map(async (change) => {
			const info = await env.fileInfo(`${cwd}/${change.file}`, context);
			if (!info.ok && info.error.code !== "not_found") throw info.error;
			const version = info.ok
				? `${info.value.kind}:${info.value.size}:${info.value.mtimeMs}`
				: "deleted";
			return Object.assign(change, { version });
		}),
	);
	return {
		...(lane ? { lane: lane.name } : {}),
		...(branch && branch !== "HEAD" ? { branch } : {}),
		cwd,
		...range,
		files,
	};
}

/** `file` must be one `changes` listed; it is passed to git only as a quoted literal path. */
export async function patch(
	env: ExecutionEnv,
	cwd: string,
	project: string,
	target: string | undefined,
	file: string,
	context: Context,
): Promise<string> {
	if (!file || file.startsWith("/") || file.split("/").includes("..") || file.includes("\0")) {
		throw new Error(`Invalid path ${file}`);
	}
	const { base: from } = await base(env, cwd, project, target, context);
	const known = await read(env, cwd, `ls-files -- ${quote(file)}`, context);
	const historic = await read(
		env,
		cwd,
		`diff -M --name-status -z ${from} -- ${quote(file)}`,
		context,
	);
	let text: string;
	if (known.trim() || historic) {
		// A renamed file's diff needs its old path in the pathspec too.
		const status = await read(env, cwd, `diff -M --name-status -z ${from}`, context);
		const fields = status.split("\0");
		const at = fields.findIndex((value, i) => value === file && fields[i - 2]?.startsWith("R"));
		const paths = at > 0 ? `${quote(fields[at - 1]!)} ${quote(file)}` : quote(file);
		text = await read(env, cwd, `diff -M ${from} -- ${paths}`, context);
	} else {
		text = await read(env, cwd, `diff --no-index -- /dev/null ${quote(file)}`, context, [0, 1]);
	}
	return text.length > PATCH ? `${text.slice(0, PATCH)}\n… (diff truncated)` : text;
}
