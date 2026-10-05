import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
	type Desktop,
	DESKTOP_KEYS,
	DESKTOP_MODIFIERS,
	DESKTOP_SELECTIONS,
	type DesktopAction,
	type DesktopOutcome,
	type DesktopRequest,
	type DesktopResult,
	isDesktopAction,
} from "@ace/channel/desktop";

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
	input?: string,
): Promise<string> {
	signal.throwIfAborted();
	try {
		const pending = exec(path, args, {
			encoding: "utf8",
			signal,
			killSignal: "SIGKILL",
			maxBuffer: MAX_OUTPUT,
		});
		let inputError: Error | undefined;
		if (input !== undefined) {
			// A signing or setup refusal can exit before reading stdin; its JSON still owns the outcome.
			pending.child.stdin!.on("error", (error) => inputError = error);
			pending.child.stdin!.end(input);
		}
		const { stdout } = await pending;
		if (inputError && !stdout.trim()) throw inputError;
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
	options: {
		target?: Extract<DesktopRequest, { op: "inspect" }>;
		input?: string;
		onDispatch?(): void;
	} = {},
): Promise<Record<string, unknown>> {
	const path = process.env.ACE_DESKTOP_CLIENT
		|| join(dirname(process.execPath), "ace-desktop-client");
	if (!existsSync(path)) {
		throw new Error(
			"Native desktop tools require the Ace desktop app on this host. Source hosts can set ACE_DESKTOP_CLIENT to its bundled ace-desktop-client.",
		);
	}
	const socket = join(config.home, "desktop.sock");
	if (!existsSync(socket)) {
		throw new Error("Open Ace on this host to enable native desktop tools.");
	}
	signal.throwIfAborted();
	options.onDispatch?.();
	const output = await run(path, [socket, ...args], signal, true, options.input);
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
		const reason = error ? `${error.code}: ${error.message}` : "Native desktop operation failed";
		const permission = error?.code.toLowerCase().includes("permission")
			? " Check Ace's Accessibility and Screen Recording access in Ace Settings."
			: "";
		throw new Error(`${reason}.${permission}`);
	}
	if (!value.data || typeof value.data !== "object") {
		throw new Error("The Ace native client returned no desktop data.");
	}
	const { target } = options;
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
	}
	return {
		...value.data,
		...(value.target_receipt ? { target_receipt: value.target_receipt } : {}),
	};
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
		const data = await native(["inspect", pid, window, path], signal, { target: request });
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

function validateAction(request: DesktopAction) {
	if (typeof request.snapshot !== "string" || !request.snapshot || request.snapshot.length > 256) {
		throw new Error("Use the snapshot_id from a fresh desktop_inspect result.");
	}
	if (request.op === "key") {
		if (!DESKTOP_KEYS.includes(request.key)) throw new Error("Choose one supported key.");
		const modifiers = request.modifiers;
		if (
			modifiers !== undefined && (
				!Array.isArray(modifiers) || modifiers.length > 4
				|| new Set(modifiers).size !== modifiers.length
				|| modifiers.some((modifier) => !DESKTOP_MODIFIERS.includes(modifier))
			)
		) {
			throw new Error("Use each of command, control, option, and shift at most once.");
		}
		return;
	}
	if (request.op === "insert") {
		if (typeof request.text !== "string" || !request.text || request.text.length > 8192) {
			throw new Error("Inserted text must contain 1 to 8192 UTF-16 code units.");
		}
		return;
	}
	if (typeof request.element !== "string" || !request.element || request.element.length > 256) {
		throw new Error("Choose an element ID from the inspected snapshot.");
	}
	if (request.op === "type" && (typeof request.text !== "string" || request.text.length > 8192)) {
		throw new Error("Replacement text must contain at most 8192 UTF-16 code units.");
	}
	if (request.op === "select") {
		if (typeof request.text !== "string" || !request.text || request.text.length > 4096) {
			throw new Error("Selection text must contain 1 to 4096 UTF-16 code units.");
		}
		for (const context of [request.prefix, request.suffix]) {
			if (context !== undefined && (typeof context !== "string" || context.length > 2048)) {
				throw new Error("Selection context must contain at most 2048 UTF-16 code units.");
			}
		}
		if (request.selection !== undefined && !DESKTOP_SELECTIONS.includes(request.selection)) {
			throw new Error("Choose text, cursor_before, or cursor_after for selection.");
		}
	}
}

function actionResult(data: Record<string, unknown>, outcome: DesktopOutcome): DesktopResult {
	let text = JSON.stringify({ action: data });
	if (Buffer.byteLength(text) > MAX_TEXT) {
		text = JSON.stringify({
			action: {
				outcome,
				target_receipt: data.target_receipt,
				clipboard_changed: data.clipboard_changed,
				clipboard_cleanup: data.clipboard_cleanup,
				clipboard_ownership: data.clipboard_ownership,
				consumption: data.consumption,
			},
			warning: "Native action metadata exceeded the result limit. Inspect the current state.",
		});
	}
	return { text, outcome, isError: outcome !== "completed" };
}

async function act(request: DesktopAction, signal: AbortSignal): Promise<DesktopResult> {
	let dispatched = false;
	let data: Record<string, unknown>;
	try {
		validateAction(request);
		data = await native(["action"], signal, {
			input: JSON.stringify(request),
			onDispatch() {
				dispatched = true;
			},
		});
		if (!["completed", "refused", "unknown"].includes(String(data.outcome))) {
			throw new Error("The Ace native client returned no action outcome.");
		}
	} catch (error) {
		const outcome = dispatched ? "unknown" : "refused";
		return actionResult({
			outcome,
			reason: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
			message: dispatched
				? "The desktop action may have partially run. Inspect the current state before retrying. Stopping does not undo input already delivered."
				: "The desktop action was not sent to the native desktop.",
		}, outcome);
	}
	const outcome = data.outcome as DesktopOutcome;
	if (outcome !== "completed") return actionResult(data, outcome);
	// Observation is separate from delivery: its failure must not turn completed input into a retry.
	try {
		const receipt = data.target_receipt as Reply["target_receipt"];
		if (!receipt?.process_start_identity_decimal) {
			throw new Error("No exact-window action receipt.");
		}
		const observation = await inspect({
			op: "inspect",
			pid: receipt.pid,
			window: receipt.window_id,
		}, signal);
		const fresh = JSON.parse(observation.text) as Record<string, unknown>;
		const current = fresh.target_receipt as Reply["target_receipt"];
		if (current?.process_start_identity_decimal !== receipt.process_start_identity_decimal) {
			throw new Error("The target application changed after the action.");
		}
		return {
			text: bounded({ ...fresh, action: data }, "ui_elements"),
			image: observation.image,
			outcome,
			isError: false,
		};
	} catch (error) {
		return actionResult({
			...data,
			observation_error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
			message:
				"The action completed, but a fresh observation was unavailable. Inspect again to verify the result; do not repeat the action blindly.",
		}, outcome);
	}
}

export const desktop: Desktop = async (request, context) => {
	if (
		!request
		|| !["apps", "windows", "inspect", "click", "type", "key", "insert", "select"].includes(
			request.op,
		)
	) {
		throw new Error("Unknown native desktop request.");
	}
	if (process.platform !== "darwin") {
		const reason = "Native desktop tools require macOS 15 or later.";
		if (isDesktopAction(request)) return actionResult({ outcome: "refused", reason }, "refused");
		throw new Error(reason);
	}
	const deadline = new AbortController();
	const timer = setTimeout(
		() => deadline.abort(new Error("Native desktop operation timed out after 30 seconds.")),
		30_000,
	);
	const signal = context.abortSignal
		? AbortSignal.any([context.abortSignal, deadline.signal])
		: deadline.signal;
	try {
		if (isDesktopAction(request)) return await act(request, signal);
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
