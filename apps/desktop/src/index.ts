import { join } from "node:path";

import { BrowserWindow } from "electrobun/bun";

/**
 * Apps opened from Finder get launchd's bare environment, without the PATH that agents' tools
 * need or keys exported in shell profiles. Adopt the login shell's environment, as terminal-centric
 * editors do; Ace's own settings from the launch environment still win.
 */
function adoptLoginShell() {
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
	const own = Object.entries(process.env).filter(([name]) => name.startsWith("ACE_"));
	for (const pair of out.slice(start + mark.length).split("\0")) {
		const split = pair.indexOf("=");
		if (split > 0) process.env[pair.slice(0, split)] = pair.slice(split + 1);
	}
	for (const [name, value] of own) process.env[name] = value;
}

adoptLoginShell();
process.env.ACE_WORKER ||= join(import.meta.dir, "..", "worker", "worker.js");
process.env.ACE_APP_DIR ||= join(import.meta.dir, "..", "web");

const port = Number(process.env.ACE_PORT || 4140);
const url = process.env.ACE_APP_URL || `http://127.0.0.1:${port}`;

async function reachable(): Promise<boolean> {
	try {
		return (await fetch(`http://127.0.0.1:${port}/`)).status < 500;
	} catch {
		return false;
	}
}

// A host already serving this port (`ace serve` in a terminal) keeps its channels; the window
// joins it. Otherwise this process is the host. Imported late so it sees the adopted environment.
if (!(await reachable())) {
	const { serve } = await import("@ace/host/gateway");
	void serve(port);
	for (let wait = 50; !(await reachable()) && wait < 5000; wait *= 1.5) await Bun.sleep(wait);
}

const window = new BrowserWindow({
	title: "Ace",
	titleBarStyle: "hiddenInset",
	url,
	frame: { width: 1100, height: 760, x: 160, y: 120 },
});
window.on("close", () => process.exit(0));
