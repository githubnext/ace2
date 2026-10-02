import { spawn } from "node:child_process";

import { BrowserWindow } from "electrobun/bun";

// Electrobun bundles this file, so the host runs from the checkout as its own process: channel
// workers are spawned from the host's source files, which a bundle cannot carry yet.
const root = process.env.ACE_ROOT;
if (!root) throw new Error("Set ACE_ROOT to the Ace checkout; bun desktop dev does this");
const port = Number(process.env.ACE_PORT || 4140);
const url = process.env.ACE_APP_URL || `http://127.0.0.1:${port}`;

async function reachable(): Promise<boolean> {
	try {
		return (await fetch(`http://127.0.0.1:${port}/`)).status < 500;
	} catch {
		return false;
	}
}

if (!(await reachable())) {
	const bun = process.env.ACE_BUN || "bun";
	const host = spawn(bun, [`${root}/apps/host/src/cli.ts`, "serve", "--port", String(port)], {
		cwd: root,
		stdio: "inherit",
	});
	process.on("exit", () => host.kill());
	for (let wait = 100; !(await reachable()) && wait < 5000; wait *= 1.5) await Bun.sleep(wait);
}

const window = new BrowserWindow({
	title: "Ace",
	titleBarStyle: "hiddenInset",
	url,
	frame: { width: 1100, height: 760, x: 160, y: 120 },
});
window.on("close", () => process.exit(0));
