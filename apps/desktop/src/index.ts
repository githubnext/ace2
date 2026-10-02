import { dirname, join } from "node:path";

import Electrobun, { ApplicationMenu, BrowserWindow, Utils } from "electrobun/bun";

import { appUrl, token } from "@ace/host/auth";
import { config, desktop } from "@ace/host/config";
import { health } from "@ace/host/health";

import { service } from "./service";

const resources = join(dirname(process.execPath), "..", "Resources");
const { channel, identifier } = await Bun.file(join(resources, "version.json")).json() as {
	channel: string;
	identifier: string;
};
desktop(channel);
const helper = service(identifier);
const url = appUrl();
let window: BrowserWindow | undefined;
let ready = false;

function show(settings = false): void {
	if (!ready) return;
	if (window) {
		window.focus();
		if (settings) {
			window.webview.executeJavascript("window.dispatchEvent(new Event('ace:settings'))");
		}
		return;
	}
	const target = new URL(url);
	if (settings) target.hash = "settings";
	window = new BrowserWindow({
		title: "Ace",
		titleBarStyle: "hiddenInset",
		url: target.href,
		preload: `if (window === window.top && location.origin === ${JSON.stringify(url.origin)}) {
			Object.defineProperty(window, "__ACE_TOKEN__", { configurable: true, value: ${
			JSON.stringify(token())
		} });
		}`,
		frame: { width: 1100, height: 760, x: 160, y: 120 },
	});
	window.on("close", () => window = undefined);
}

ApplicationMenu.setApplicationMenu([
	{
		label: "Ace",
		submenu: [
			{ label: "Show Ace", action: "show" },
			{ label: "Settings…", action: "settings", accelerator: "CmdOrCtrl+," },
			{ type: "divider" },
			{ label: "Ace Helper Settings…", action: "helper-settings" },
			{ label: "Show Ace Helper Log", action: "helper-log" },
			{ type: "divider" },
			{ label: "Quit Ace", role: "quit" },
		],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "divider" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	},
]);

Electrobun.events.on("reopen", () => show());
Electrobun.events.on("application-menu-clicked", ({ data }) => {
	if (data.action === "show") return show();
	if (data.action === "settings") return show(true);
	if (data.action === "helper-settings") return helper.settings();
	if (data.action === "helper-log") Utils.showItemInFolder(join(config.home, "helper.log"));
});

async function start(): Promise<void> {
	let info = await health(config.port);
	if (!info) {
		if (helper.status() === "unregistered") {
			// The bundled macOS dialog renders message but does not display detail.
			const { response } = await Utils.showMessageBox({
				title: "Ace Helper",
				message:
					"Enable Ace Helper?\n\nAce Helper keeps this machine's channels available after you quit Ace and starts when you log in. You can manage it in macOS Login Items.",
				buttons: ["Enable Ace Helper", "Quit"],
				cancelId: 1,
			});
			if (response !== 0) return Utils.quit();
			helper.register();
		}
		if (helper.status() === "approval") {
			const { response } = await Utils.showMessageBox({
				title: "Ace Helper",
				message:
					"Allow Ace Helper to run in the background.\n\nEnable Ace in macOS Login Items, then reopen Ace.",
				buttons: ["Open Login Items", "Quit"],
				cancelId: 1,
			});
			if (response === 0) helper.settings();
			return Utils.quit();
		}
		const deadline = Date.now() + 15_000;
		while (!info && Date.now() < deadline) {
			await Bun.sleep(100);
			info = await health(config.port);
		}
		if (!info) throw new Error(`Ace Helper did not start. See ${join(config.home, "helper.log")}`);
	}
	if (info.home !== config.home) {
		throw new Error(`Port ${config.port} belongs to an Ace host using a different data directory`);
	}
	ready = true;
	show();
}

try {
	await start();
} catch (error) {
	await Utils.showMessageBox({
		type: "error",
		title: "Ace Helper",
		message: `Could not connect to Ace Helper.\n\n${
			error instanceof Error ? error.message : String(error)
		}`,
	});
	Utils.quit();
}
