import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
	Browser,
	BrowserNavigate,
	BrowserRequest,
	BrowserResult,
	BrowserTarget,
} from "@ace/channel/browser";

import { config } from "./config";

const DEADLINE = 30_000;
const SCREENSHOT_DEADLINE = 10_000;
// Larger DevTools messages are neither parsed nor retained; only their command fails.
const MAX_MESSAGE = 16 * 1024 * 1024;
const MAX_TREE = 32_000;
const MAX_FIELD = 400;
const MAX_TABS_TEXT = 32_000;
// A result must fit the hosted channel's 2 MB SQLite row after JSON encoding.
const MAX_RESULT = 1_900_000;

/** The dedicated profile; Chrome writes its loopback port and browser path here. */
const profile = () => join(config.home, "browser");

class Refusal extends Error {}

type Endpoint = { id: string; port: number; url: string };

function launch(): string {
	const [chrome, note] = process.platform === "darwin"
		? [`open -na "Google Chrome" --args`, ""]
		: [
			"chromium",
			" Use google-chrome or another Chromium executable in place of chromium if needed.",
		];
	return `Launch Ace's dedicated development browser with its own profile, for example: \`${chrome} --user-data-dir="${profile()}" --remote-debugging-port=0 --no-first-run --no-default-browser-check\`.${note}`;
}

async function endpoint(): Promise<Endpoint> {
	let text: string;
	try {
		text = await readFile(join(profile(), "DevToolsActivePort"), "utf8");
	} catch {
		throw new Refusal(`No dedicated development browser is running. ${launch()}`);
	}
	const [port, path] = text.split("\n");
	const id = /^\/devtools\/browser\/([0-9a-f-]{36})$/.exec(path || "")?.[1];
	const number = Number(port);
	if (!/^\d{1,5}$/.test(port || "") || number < 1 || number > 65_535 || !id) {
		throw new Refusal(
			`The dedicated browser profile has an unreadable DevToolsActivePort file. ${launch()}`,
		);
	}
	return { id, port: number, url: `ws://127.0.0.1:${number}${path}` };
}

type Pending = { resolve(value: Record<string, unknown>): void; reject(error: Error): void };

class CdpError extends Error {}

/** One loopback DevTools connection; closing or aborting fails every pending command. */
class Cdp {
	#socket: WebSocket;
	#next = 1;
	#pending = new Map<number, Pending>();
	#closed?: Error;

	private constructor(socket: WebSocket, signal: AbortSignal) {
		this.#socket = socket;
		socket.addEventListener("message", ({ data }) => {
			if (typeof data !== "string") {
				return this.close(new Error("The browser sent a binary DevTools message."));
			}
			if (data.length > MAX_MESSAGE || Buffer.byteLength(data) > MAX_MESSAGE) {
				// Chrome serializes the command id first, so only that command fails and its payload is dropped.
				const id = Number(/^\{"id":(\d+),/.exec(data.slice(0, 32))?.[1]);
				const pending = this.#pending.get(id);
				this.#pending.delete(id);
				return pending?.reject(
					new Error("The browser's answer exceeded the 16 MB DevTools message limit."),
				);
			}
			const message = JSON.parse(data) as {
				id?: number;
				result?: Record<string, unknown>;
				error?: { message: string };
			};
			if (message.id === undefined) return;
			const pending = this.#pending.get(message.id);
			if (!pending) return;
			this.#pending.delete(message.id);
			if (message.error) return pending.reject(new CdpError(message.error.message.slice(0, 500)));
			pending.resolve(message.result || {});
		});
		socket.addEventListener("close", () => this.close(new Error("The browser connection closed.")));
		signal.addEventListener("abort", () => this.close(abortError(signal)), { once: true });
	}

	static async open(url: string, signal: AbortSignal): Promise<Cdp> {
		signal.throwIfAborted();
		const socket = new WebSocket(url);
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const abort = () => reject(abortError(signal));
		signal.addEventListener("abort", abort, { once: true });
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("Cannot connect")), { once: true });
		socket.addEventListener("close", () => reject(new Error("Cannot connect")), { once: true });
		try {
			await promise;
		} catch (error) {
			socket.close();
			if (signal.aborted) throw error;
			throw new Refusal(`The dedicated development browser is not reachable. ${launch()}`);
		} finally {
			signal.removeEventListener("abort", abort);
		}
		return new Cdp(socket, signal);
	}

	/** `sent` runs once the command has been handed to the socket. */
	send(
		method: string,
		params: Record<string, unknown> = {},
		options: { session?: string; timeout?: number; sent?(): void } = {},
	): Promise<Record<string, unknown>> {
		if (this.#closed) return Promise.reject(this.#closed);
		const id = this.#next++;
		const { promise, resolve, reject } = Promise.withResolvers<Record<string, unknown>>();
		const timer = options.timeout
			? setTimeout(() => {
				this.#pending.delete(id);
				reject(new Error(`${method} timed out after ${options.timeout! / 1000} seconds.`));
			}, options.timeout)
			: undefined;
		this.#pending.set(id, {
			resolve: (value) => {
				clearTimeout(timer);
				resolve(value);
			},
			reject: (error) => {
				clearTimeout(timer);
				reject(error);
			},
		});
		try {
			this.#socket.send(JSON.stringify({
				id,
				method,
				params,
				...(options.session ? { sessionId: options.session } : {}),
			}));
		} catch (error) {
			this.#pending.get(id)?.reject(error as Error);
			this.#pending.delete(id);
			return promise;
		}
		options.sent?.();
		return promise;
	}

	close(error = new Error("The browser connection closed.")): void {
		if (this.#closed) return;
		this.#closed = error;
		for (const pending of this.#pending.values()) pending.reject(error);
		this.#pending.clear();
		this.#socket.close();
	}
}

function abortError(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new Error("The browser operation was cancelled.");
}

const encoder = new TextEncoder();

function bytes(text: string): number {
	return encoder.encode(text).length;
}

/** Truncate to whole code points within a UTF-8 byte budget. */
function clip(text: string, max: number): string {
	if (text.length * 3 <= max) return text;
	const { read } = encoder.encodeInto(text, new Uint8Array(max));
	return read === text.length
		? text
		: text.slice(0, encoder.encodeInto(text, new Uint8Array(max - 3)).read) + "…";
}

function field(value: unknown): string {
	return clip(typeof value === "string" ? value : String(value ?? ""), MAX_FIELD);
}

type TargetInfo = {
	targetId: string;
	type: string;
	subtype?: string;
	url: string;
	title: string;
	attached: boolean;
};

function isTab(info: TargetInfo): boolean {
	return info.type === "page" && info.subtype !== "prerender";
}

async function connect(signal: AbortSignal, target?: BrowserTarget) {
	const found = await endpoint();
	if (target && target.browser !== found.id) {
		throw new Refusal(
			"The dedicated browser was restarted or replaced since this target was listed. Call browser_tabs and choose a target from the current browser.",
		);
	}
	const cdp = await Cdp.open(found.url, signal);
	return { cdp, endpoint: found };
}

async function attach(
	cdp: Cdp,
	target: BrowserTarget,
): Promise<{ session: string; info: TargetInfo }> {
	let info: TargetInfo;
	try {
		({ targetInfo: info } = await cdp.send("Target.getTargetInfo", {
			targetId: target.target_id,
		}) as {
			targetInfo: TargetInfo;
		});
	} catch (error) {
		if (!(error instanceof CdpError)) throw error;
		throw new Refusal(
			"The target tab no longer exists. Call browser_tabs and choose a current target.",
		);
	}
	if (!isTab(info)) {
		throw new Refusal("The target is not a page tab. Choose a tab from browser_tabs.");
	}
	const { sessionId } = await cdp.send("Target.attachToTarget", {
		targetId: target.target_id,
		flatten: true,
	}) as { sessionId: string };
	return { session: sessionId, info };
}

async function tabs(signal: AbortSignal): Promise<BrowserResult> {
	const { cdp, endpoint } = await connect(signal);
	try {
		const { product } = await cdp.send("Browser.getVersion") as { product: string };
		const { targetInfos } = await cdp.send("Target.getTargets") as { targetInfos: TargetInfo[] };
		const all = targetInfos.filter(isTab);
		const listed = all.map((info) => ({
			target: { browser: endpoint.id, target_id: info.targetId },
			url: field(info.url),
			title: field(info.title),
			attached: info.attached,
		}));
		const value = {
			browser: {
				id: endpoint.id,
				product,
				profile: profile(),
				endpoint: `127.0.0.1:${endpoint.port}`,
			},
			tabs: listed,
		};
		let text = JSON.stringify(value);
		while (bytes(text) > MAX_TABS_TEXT) {
			listed.pop();
			text = JSON.stringify({ ...value, truncated: { total: all.length, shown: listed.length } });
		}
		return { text };
	} finally {
		cdp.close();
	}
}

type AXValue = { value?: unknown };
type AXNode = {
	nodeId: string;
	ignored: boolean;
	role?: AXValue;
	name?: AXValue;
	value?: AXValue;
	description?: AXValue;
	properties?: { name: string; value: AXValue }[];
	childIds?: string[];
	parentId?: string;
};

const STATES = new Set([
	"focused",
	"disabled",
	"checked",
	"pressed",
	"expanded",
	"selected",
	"required",
	"invalid",
	"level",
	"url",
]);

/** Render the tree depth-first within a byte budget; ignored and unnamed generic nodes pass through. */
function tree(nodes: AXNode[]): { text: string; shown: number; total: number } {
	const byId = new Map(nodes.map((node) => [node.nodeId, node]));
	const root = nodes.find((node) => !node.parentId || !byId.has(node.parentId));
	const lines: string[] = [];
	let size = 0, shown = 0, total = 0, full = false;
	const stack: [AXNode, number][] = root ? [[root, 0]] : [];
	const seen = new Set<string>();
	while (stack.length) {
		const [node, depth] = stack.pop()!;
		if (seen.has(node.nodeId)) continue;
		seen.add(node.nodeId);
		const role = field(node.role?.value);
		const name = field(node.name?.value);
		const rendered = !node.ignored && role !== "InlineTextBox"
			&& !((role === "generic" || role === "none") && !name);
		const children = (node.childIds || []).map((id) => byId.get(id)).filter((child) => !!child);
		const next = rendered ? depth + 1 : depth;
		for (let i = children.length - 1; i >= 0; i--) stack.push([children[i]!, next]);
		if (!rendered) continue;
		total++;
		if (full) continue;
		const parts = [role];
		if (name) parts.push(JSON.stringify(name));
		const value = node.value?.value;
		if (value !== undefined && value !== "") parts.push(`value=${JSON.stringify(field(value))}`);
		const description = node.description?.value;
		if (description) parts.push(`description=${JSON.stringify(field(description))}`);
		for (const property of node.properties || []) {
			if (!STATES.has(property.name)) continue;
			const state = property.value.value;
			if (state === false || state === undefined || state === "false") continue;
			parts.push(
				state === true ? property.name : `${property.name}=${JSON.stringify(field(state))}`,
			);
		}
		const line = `${"  ".repeat(Math.min(depth, 24))}${depth > 24 ? `[${depth}] ` : ""}${
			parts.join(" ")
		}`;
		const cost = bytes(line) + 1;
		if (size + cost > MAX_TREE) {
			full = true;
			continue;
		}
		size += cost;
		shown++;
		lines.push(line);
	}
	return { text: lines.join("\n"), shown, total };
}

type Frame = { id: string; loaderId: string; url: string };

async function frame(cdp: Cdp, session: string): Promise<Frame> {
	const { frameTree } = await cdp.send("Page.getFrameTree", {}, { session }) as {
		frameTree: { frame: Frame };
	};
	return frameTree.frame;
}

function message(error: unknown): string {
	return clip(error instanceof Error ? error.message : String(error), 2000);
}

const MAX_IMAGE = 900_000;
const MAX_SIDE = 4096;

/** Dimensions of a complete JPEG, or undefined when it is malformed. */
function jpeg(data: Buffer): { width: number; height: number } | undefined {
	if (data[0] !== 0xff || data[1] !== 0xd8 || data.at(-2) !== 0xff || data.at(-1) !== 0xd9) return;
	let at = 2;
	while (at + 9 < data.length) {
		if (data[at] !== 0xff) return;
		const marker = data[at + 1]!;
		if (marker === 0xff) {
			at++;
			continue;
		}
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return { height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
		}
		at += 2 + data.readUInt16BE(at + 2);
	}
}

async function capture(cdp: Cdp, session: string) {
	const { cssVisualViewport: viewport } = await cdp.send("Page.getLayoutMetrics", {}, {
		session,
	}) as { cssVisualViewport: Record<string, number> };
	// Without a clip Chrome captures the visible viewport at device resolution; a clip's DIP space
	// differs from CSS layout metrics under browser zoom, and resizing would need a platform tool.
	for (const quality of [80, 60, 40]) {
		const { data } = await cdp.send("Page.captureScreenshot", {
			format: "jpeg",
			quality,
			captureBeyondViewport: false,
		}, { session, timeout: SCREENSHOT_DEADLINE }) as { data: string };
		if (typeof data !== "string" || data.length > Math.ceil(MAX_IMAGE / 3) * 4) continue;
		const image = Buffer.from(data, "base64");
		const size = jpeg(image);
		if (!size || image.toString("base64") !== data) {
			throw new Error("The browser returned a malformed JPEG screenshot.");
		}
		if (size.width > MAX_SIDE || size.height > MAX_SIDE) {
			throw new Error(
				`The viewport screenshot is ${size.width}x${size.height} device pixels, above the ${MAX_SIDE}-pixel limit.`,
			);
		}
		return {
			image: { mimeType: "image/jpeg", data },
			metadata: {
				...size,
				bytes: image.length,
				quality,
				viewport: {
					page_x: viewport.pageX,
					page_y: viewport.pageY,
					width: viewport.clientWidth,
					height: viewport.clientHeight,
					scale: viewport.scale,
					zoom: viewport.zoom,
				},
				note:
					"The visible viewport at its scroll position in device pixels, captured after the accessibility read. Viewport metrics are CSS pixels; content outside the viewport is not shown.",
			},
		};
	}
	throw new Error("The viewport screenshot exceeds 900 KB even at JPEG quality 40.");
}

async function inspect(
	request: Extract<BrowserRequest, { op: "inspect" }>,
	signal: AbortSignal,
): Promise<BrowserResult> {
	const { cdp } = await connect(signal, request.target);
	try {
		const { session, info } = await attach(cdp, request.target);
		const before = await frame(cdp, session);
		// From here, failures and the deadline keep whatever evidence was already observed.
		let accessibility: Record<string, unknown>;
		let body = "";
		try {
			const { nodes } = await cdp.send("Accessibility.getFullAXTree", {}, { session }) as {
				nodes: AXNode[];
			};
			const rendered = tree(nodes);
			body = rendered.text;
			accessibility = {
				coverage:
					"Main frame document only; iframe documents are not included. Ignored nodes, inline text boxes, and unnamed generic containers are folded into their parents.",
				nodes: rendered.total,
				shown: rendered.shown,
				truncated: rendered.shown < rendered.total,
				limit_bytes: MAX_TREE,
				field_limit_bytes: MAX_FIELD,
			};
		} catch (error) {
			accessibility = { error: message(error) };
		}
		let image: BrowserResult["image"];
		let shot: Record<string, unknown> | undefined;
		if (request.screenshot !== false) {
			try {
				const captured = await capture(cdp, session);
				image = captured.image;
				shot = captured.metadata;
			} catch (error) {
				shot = {
					error: message(error),
					note:
						"No screenshot was returned; background tabs may not produce frames. Any accessibility evidence is retained; see verification for whether the document changed.",
				};
			}
		}
		let verification: Record<string, unknown>;
		try {
			const after = await frame(cdp, session);
			verification = before.loaderId === after.loaderId && before.url === after.url
				? { document: "unchanged" }
				: {
					document: "changed",
					loader_id: after.loaderId,
					url: field(after.url),
					warning:
						"The main document changed during inspection. The accessibility tree and screenshot may describe different documents; inspect again for coherent evidence.",
				};
		} catch (error) {
			verification = {
				document: "unverified",
				error: message(error),
				warning:
					"Whether the main document changed during inspection is unknown; the evidence may not describe one document.",
			};
		}
		const header = {
			target: request.target,
			title: field(info.title),
			document: { frame_id: before.id, loader_id: before.loaderId, url: field(before.url) },
			accessibility,
			...(shot ? { screenshot: shot } : {}),
			verification,
		};
		const isError = !body && !image;
		const text = `${JSON.stringify(header)}\n${body}`;
		const value: BrowserResult = {
			text,
			...(image ? { image } : {}),
			...(isError ? { isError } : {}),
		};
		if (bytes(JSON.stringify(value)) <= MAX_RESULT) return value;
		const omitted = { error: "The screenshot was omitted to keep the result under 2 MB." };
		return { text: `${JSON.stringify({ ...header, screenshot: omitted })}\n${body}` };
	} finally {
		cdp.close();
	}
}

function refused(reason: string): BrowserResult {
	return {
		outcome: "refused",
		isError: true,
		text: JSON.stringify({
			outcome: "refused",
			reason,
			message: "The navigation was not sent to the browser.",
		}),
	};
}

function validateUrl(url: unknown): string | undefined {
	if (typeof url !== "string" || url.length > 4096) {
		return "Choose an absolute http or https URL of at most 4096 characters.";
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return "Choose an absolute http or https URL.";
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return "browser_navigate supports only http and https URLs.";
	}
}

async function navigate(request: BrowserNavigate, signal: AbortSignal): Promise<BrowserResult> {
	const invalid = validateUrl(request.url);
	if (invalid) return refused(invalid);
	let sent = false;
	let cdp: Cdp | undefined;
	try {
		({ cdp } = await connect(signal, request.target));
		const { session } = await attach(cdp, request.target);
		signal.throwIfAborted();
		const reply = await cdp.send("Page.navigate", { url: request.url }, {
			session,
			sent: () => sent = true,
		}) as { frameId: string; loaderId?: string; errorText?: string; isDownload?: boolean };
		// Chrome reports a navigation that became a download with net::ERR_ABORTED.
		const status = reply.isDownload
			? "download"
			: reply.errorText
			? "failed"
			: reply.loaderId
			? "started"
			: "same_document";
		const text = JSON.stringify({
			outcome: "completed",
			navigation: {
				status,
				frame_id: reply.frameId,
				...(reply.loaderId ? { loader_id: reply.loaderId } : {}),
				...(reply.errorText ? { error_text: field(reply.errorText) } : {}),
				...(reply.isDownload ? { is_download: true } : {}),
			},
			target: request.target,
			url: field(request.url),
			message: status === "failed"
				? "Chrome reported a failed navigation. Inspect the tab to see what it shows now."
				: status === "download"
				? "Chrome handled the URL as a download in the dedicated profile; the tab's document was not replaced. Inspect the tab before drawing conclusions."
				: "Chrome answered the navigation request. This does not mean the page finished loading or rendered; inspect the tab before drawing conclusions.",
		});
		return { outcome: "completed", text, ...(status === "failed" ? { isError: true } : {}) };
	} catch (error) {
		if (error instanceof Refusal) return refused(error.message);
		if (!sent) {
			return refused(
				signal.aborted ? "The navigation was cancelled before dispatch." : message(error),
			);
		}
		// Even a protocol error reply cannot prove that no navigation began.
		return {
			outcome: "unknown",
			isError: true,
			text: JSON.stringify({
				outcome: "unknown",
				reason: message(error),
				message:
					"The navigation was sent without a usable answer. It may have happened or may still happen; inspect the tab before navigating again.",
			}),
		};
	} finally {
		cdp?.close();
	}
}

export const browser: Browser = async (request, context) => {
	if (!request || !["tabs", "inspect", "navigate"].includes(request.op)) {
		throw new Error("Unknown browser request.");
	}
	const deadline = AbortSignal.timeout(DEADLINE);
	const signal = context.abortSignal ? AbortSignal.any([context.abortSignal, deadline]) : deadline;
	if (request.op === "navigate") return navigate(request, signal);
	try {
		if (request.op === "tabs") return await tabs(signal);
		return await inspect(request, signal);
	} catch (error) {
		if (error instanceof Refusal) throw new Error(error.message, { cause: error });
		throw error;
	}
};
