import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { Desktop, DesktopRequest, DesktopResult } from "@ace/channel/desktop";

import { config } from "./config";

const exec = promisify(execFile);
const MAX_TEXT = 32_000;
const MAX_IMAGE = 900_000;
const MAX_OUTPUT = 2_000_000;

type Reply = {
	success: boolean;
	data: Record<string, unknown> | null;
	error?: { code: string; message: string; details?: string };
	target_receipt?: { pid: number; window_id: number; process_start_identity_decimal?: string };
};

async function run(
	path: string,
	args: string[],
	signal: AbortSignal,
	errorJson = false,
): Promise<string> {
	signal.throwIfAborted();
	try {
		const { stdout } = await exec(path, args, {
			encoding: "utf8",
			signal,
			killSignal: "SIGKILL",
			maxBuffer: MAX_OUTPUT,
		});
		return stdout;
	} catch (error) {
		signal.throwIfAborted();
		const failed = error as Error & { code?: number | string; stdout?: string; stderr?: string };
		// The native client reports expected refusals as JSON on unsuccessful exits too.
		if (errorJson && typeof failed.code === "number" && failed.stdout?.trim()) return failed.stdout;
		throw new Error((failed.stderr?.trim() || failed.message).slice(0, 2000), { cause: error });
	}
}

async function native(
	args: string[],
	signal: AbortSignal,
	target?: Extract<DesktopRequest, { op: "inspect" }>,
): Promise<Record<string, unknown>> {
	const path = process.env.ACE_DESKTOP_CLIENT
		|| join(dirname(process.execPath), "ace-desktop-client");
	if (!existsSync(path)) {
		throw new Error(
			"Native inspection requires the Ace desktop app on this host. Source hosts can set ACE_DESKTOP_CLIENT to its bundled ace-desktop-client.",
		);
	}
	const socket = join(config.home, "desktop.sock");
	if (!existsSync(socket)) {
		throw new Error("Open Ace on this host to enable native inspection.");
	}
	const output = await run(path, [socket, ...args], signal, true);
	let value: Reply;
	try {
		value = JSON.parse(output) as Reply;
	} catch {
		throw new Error("The Ace native client returned invalid JSON.");
	}
	if (!value || typeof value.success !== "boolean") {
		throw new Error("The Ace native client returned an unsupported response.");
	}
	if (!value.success) {
		const error = value.error;
		const reason = error ? `${error.code}: ${error.message}` : "Native inspection failed";
		const permission = error?.code.toLowerCase().includes("permission")
			? " Check Ace's Accessibility and Screen Recording access in Ace Settings."
			: "";
		throw new Error(`${reason}.${permission}`);
	}
	if (!value.data || typeof value.data !== "object") {
		throw new Error("The Ace native client returned no inspection data.");
	}
	if (target) {
		const receipt = value.target_receipt;
		if (!receipt) {
			throw new Error("Native inspection returned no exact-window receipt.");
		}
		if (receipt.pid !== target.pid || receipt.window_id !== target.window) {
			throw new Error(
				"Native inspection returned a different application or window. Refresh the desktop inventory and select the target again.",
			);
		}
		return { ...value.data, target_receipt: receipt };
	}
	return value.data;
}

function bounded(data: Record<string, unknown>, field: string): string {
	const source = data[field];
	if (!Array.isArray(source)) throw new Error(`Native inspection returned no ${field} array.`);
	const values = [...source];
	const value = { ...data, [field]: values };
	let text = JSON.stringify(value);
	while (Buffer.byteLength(text) > MAX_TEXT && values.length) {
		values.pop();
		text = JSON.stringify({
			...value,
			ace_truncated: true,
			ace_omitted: source.length - values.length,
		});
	}
	if (Buffer.byteLength(text) > MAX_TEXT) {
		throw new Error("Native inspection metadata exceeds the result limit.");
	}
	return text;
}

function positive(value: number): string {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error("Choose a positive application PID and window ID from the desktop inventory.");
	}
	return String(value);
}

async function screenshot(input: string, output: string, signal: AbortSignal) {
	const file = await stat(input);
	if (!file.isFile() || file.size > 32_000_000) {
		throw new Error("The native screenshot is missing or too large.");
	}
	// A single result must fit the hosted channel's 2 MB SQLite row, including its base64 image.
	for (const size of [1600, 1200, 800]) {
		await run("/usr/bin/sips", [
			"-s",
			"format",
			"jpeg",
			"-s",
			"formatOptions",
			"70",
			"--resampleHeightWidthMax",
			String(size),
			input,
			"--out",
			output,
		], signal);
		if ((await stat(output)).size > MAX_IMAGE) continue;
		const info = await run(
			"/usr/bin/sips",
			["-g", "pixelWidth", "-g", "pixelHeight", output],
			signal,
		);
		const width = Number(/pixelWidth:\s*(\d+)/.exec(info)?.[1]);
		const height = Number(/pixelHeight:\s*(\d+)/.exec(info)?.[1]);
		if (!width || !height) throw new Error("Could not read the screenshot dimensions.");
		const bytes = await readFile(output);
		if (bytes.length > MAX_IMAGE) {
			throw new Error("The resized screenshot exceeds the result limit.");
		}
		return { image: { mimeType: "image/jpeg", data: bytes.toString("base64") }, width, height };
	}
	throw new Error("The screenshot could not be resized within the result limit.");
}

async function inspect(
	request: Extract<DesktopRequest, { op: "inspect" }>,
	signal: AbortSignal,
): Promise<DesktopResult> {
	const pid = positive(request.pid);
	const window = positive(request.window);
	const directory = await mkdtemp(join(tmpdir(), "ace-desktop-"));
	try {
		const path = join(directory, "capture.png");
		const data = await native(["inspect", pid, window, path], signal, request);
		const { image, width, height } = await screenshot(path, join(directory, "image.jpg"), signal);
		const { screenshot_raw: _raw, screenshot_annotated: _annotated, ...observation } = data;
		const text = bounded({
			...observation,
			ace_image: {
				width,
				height,
				note:
					"Screenshot resized; Accessibility bounds remain in their original coordinate system.",
			},
		}, "ui_elements");
		return { text, image };
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export const desktop: Desktop = async (request, context) => {
	if (process.platform !== "darwin") {
		throw new Error("Native desktop inspection requires macOS 15 or later.");
	}
	if (!request || !["apps", "windows", "inspect"].includes(request.op)) {
		throw new Error("Unknown native desktop request.");
	}
	const deadline = new AbortController();
	const timer = setTimeout(
		() => deadline.abort(new Error("Native desktop inspection timed out after 30 seconds.")),
		30_000,
	);
	const signal = context.abortSignal
		? AbortSignal.any([context.abortSignal, deadline.signal])
		: deadline.signal;
	try {
		if (request.op === "inspect") return await inspect(request, signal);
		const args = request.op === "apps"
			? ["apps"]
			: ["windows", positive(request.pid)];
		const data = await native(args, signal);
		return { text: bounded(data, request.op === "apps" ? "apps" : "windows") };
	} finally {
		clearTimeout(timer);
	}
};
