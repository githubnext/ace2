/** Finder and launchd do not supply the PATH used by a developer's tools. */
export function adoptLoginShell(): void {
	const shell = process.env.SHELL || "/bin/zsh";
	const mark = "__ace_env__";
	const result = Bun.spawnSync([shell, "-lc", `printf ${mark}; env -0`], {
		stdin: "ignore",
		stderr: "ignore",
		timeout: 5000,
	});
	const out = result.stdout.toString();
	const start = out.indexOf(mark);
	if (!result.success || start < 0) return;
	for (const pair of out.slice(start + mark.length).split("\0")) {
		const split = pair.indexOf("=");
		if (split < 1) continue;
		const name = pair.slice(0, split);
		// Shell profiles configure tools; the desktop and helper must agree on host settings.
		if (!name.startsWith("ACE_")) process.env[name] = pair.slice(split + 1);
	}
}
