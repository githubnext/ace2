import { homedir } from "node:os";
import { dirname, join } from "node:path";

import Electrobun, { ApplicationMenu, BrowserView, BrowserWindow, Utils } from "electrobun/bun";

import { appUrl, token } from "@ace/host/auth";
import { desktop } from "@ace/host/config";

import { helper as control } from "./helper";
import type { DesktopRPC } from "./protocol";

const resources = join(dirname(process.execPath), "..", "Resources");
const { channel, identifier } = await Bun.file(join(resources, "version.json")).json() as {
	channel: string;
	identifier: string;
};
desktop(channel);
const helper = control(identifier);
const url = appUrl();
const secret = token();
let window: BrowserWindow | undefined;
let ready = false;

function authorize(value: string): void {
	if (value !== secret) throw new Error("Native controls are only available to Ace's local app");
}

const rpc = BrowserView.defineRPC<DesktopRPC>({
	handlers: {
		requests: {
			project: async ({ token }) => {
				authorize(token);
				const paths = await Utils.openFileDialog({
					startingFolder: homedir(),
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
				});
				// The SDK splits paths on commas, even for a single selected folder.
				return paths.join(",") || null;
			},
			helper: ({ token, action }) => {
				authorize(token);
				return helper.act(action);
			},
		},
		messages: {},
	},
});

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
		navigationRules: JSON.stringify(["^*", `${url.origin}/*`]),
		rpc,
		preload: `if (window === window.top && location.origin === ${JSON.stringify(url.origin)}) {
			Object.defineProperty(window, "__ACE_TOKEN__", { configurable: true, value: ${
			JSON.stringify(secret)
		} });
			Object.defineProperty(window, "__ACE_DESKTOP__", { configurable: true, value: true });
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
			{ label: "Start Ace Helper", action: "helper-start" },
			{ label: "Restart Ace Helper", action: "helper-restart" },
			{ label: "Ace Helper Settings…", action: "helper-settings" },
			{ label: "Show Ace Helper Log", action: "helper-log" },
			{ type: "divider" },
			{ label: "Quit Ace", action: "quit", accelerator: "CmdOrCtrl+q" },
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
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

Electrobun.events.on("application-menu-clicked", ({ data }) => {
	if (data.action === "show") return show();
	if (data.action === "settings") return show(true);
	if (data.action === "quit") return Utils.quit();
	const action = data.action.slice("helper-".length);
	if (action !== "start" && action !== "restart" && action !== "settings" && action !== "log") {
		return;
	}
	void helper.act(action).catch((error) =>
		Utils.showMessageBox({
			type: "error",
			title: "Ace Helper",
			message: errorMessage(error),
		})
	);
});

async function start(): Promise<void> {
	const state = await helper.status();
	if (!state.running) {
		if (state.service === "unregistered") {
			// The bundled macOS dialog renders message but does not display detail.
			const { response } = await Utils.showMessageBox({
				title: "Ace Helper",
				message:
					"Enable Ace Helper?\n\nAce Helper keeps this machine's channels available after you quit Ace and starts when you log in. You can manage it in macOS Login Items.",
				buttons: ["Enable Ace Helper", "Quit"],
				cancelId: 1,
			});
			if (response !== 0) return Utils.quit();
		}
		if (state.service === "approval") {
			const { response } = await Utils.showMessageBox({
				title: "Ace Helper",
				message:
					"Allow Ace Helper to run in the background.\n\nEnable Ace in macOS Login Items, then reopen Ace.",
				buttons: ["Open Login Items", "Quit"],
				cancelId: 1,
			});
			if (response === 0) await helper.act("settings");
			return Utils.quit();
		}
		await helper.act("start");
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
		message: `Could not connect to Ace Helper.\n\n${errorMessage(error)}`,
	});
	Utils.quit();
}
