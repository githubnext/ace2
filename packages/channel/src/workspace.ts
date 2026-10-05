/**
 * A hosted channel has no file system or shell of its own. Its tools run on a workspace: a host
 * that connects out to the channel and serves each chat's file and shell calls from its own disk.
 */
import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import {
	err,
	type ExecutionEnv,
	ExecutionError,
	FileError,
	ok,
	type Result,
	type TextLineReader,
} from "@earendil-works/pi-durable/env";

import type { Desktop, DesktopRequest, DesktopResult } from "./desktop";
import type { Metadata } from "./protocol";

declare function btoa(data: string): string;
declare function atob(data: string): string;

/** Channel to workspace. */
export type Call =
	| { call: number; method: Method | "desktop"; cwd: string; args: unknown[] }
	| { cancel: number };

/** Metadata is projected by the workspace host even when no client watches the channel. */
export type WorkspaceMessage = Call | { metadata: Metadata };

/** Workspace to channel. */
export type Reply =
	| { call: number; output: string }
	| { call: number; result: Result<unknown, Failure> };

type Failure = {
	name: "FileError" | "ExecutionError";
	code: string;
	message: string;
	path?: string;
};

const METHODS = [
	"absolutePath",
	"joinPath",
	"readTextFile",
	"readTextLines",
	"readBinaryFile",
	"writeFile",
	"appendFile",
	"truncateFile",
	"flushFile",
	"renameFile",
	"fileInfo",
	"listDir",
	"canonicalPath",
	"exists",
	"createDir",
	"remove",
	"createTempDir",
	"createTempFile",
	"exec",
] as const;
type Method = (typeof METHODS)[number];

/** JSON cannot carry bytes; file contents cross as tagged base64. */
function encode(value: unknown): unknown {
	if (!(value instanceof Uint8Array)) return value;
	let binary = "";
	for (let i = 0; i < value.length; i += 0x8000) {
		binary += String.fromCharCode(...value.subarray(i, i + 0x8000));
	}
	return { $bytes: btoa(binary) };
}

function decode(value: unknown): unknown {
	if (typeof value !== "object" || value === null || !("$bytes" in value)) return value;
	return Uint8Array.from(atob((value as { $bytes: string }).$bytes), (c) => c.charCodeAt(0));
}

function failure(error: unknown): Failure {
	if (error instanceof FileError) {
		return { name: "FileError", code: error.code, message: error.message, path: error.path };
	}
	const code = error instanceof ExecutionError ? error.code : "unknown";
	return {
		name: "ExecutionError",
		code,
		message: error instanceof Error ? error.message : String(error),
	};
}

function rebuild(f: Failure): Error {
	return f.name === "FileError"
		? new FileError(f.code as FileError["code"], f.message, f.path)
		: new ExecutionError(f.code as ExecutionError["code"], f.message);
}

/** The channel's side: one connection to the workspace, shared by every chat's environment. */
export class Link {
	#send?: (call: Call) => void;
	#next = 1;
	#pending = new Map<
		number,
		{ resolve(result: Result<unknown, Error>): void; output?(text: string): void }
	>();

	/** Attach the workspace's connection, replacing any earlier one. */
	attach(send: (call: Call) => void): void {
		this.detach();
		this.#send = send;
	}

	/** Calls in flight fail; pi reports interrupted tools to the model. */
	detach(): void {
		this.#send = undefined;
		for (const pending of this.#pending.values()) {
			pending.resolve(err(new FileError("unknown", "The workspace disconnected")));
		}
		this.#pending.clear();
	}

	get attached(): boolean {
		return !!this.#send;
	}

	receive(reply: Reply): void {
		const pending = this.#pending.get(reply.call);
		if (!pending) return;
		if ("output" in reply) return pending.output?.(reply.output);
		this.#pending.delete(reply.call);
		const { result } = reply;
		pending.resolve(result.ok ? ok(decode(result.value)) : err(rebuild(result.error)));
	}

	request(
		method: Method | "desktop",
		cwd: string,
		args: unknown[],
		context: Context,
		output?: (text: string) => void,
	): Promise<Result<unknown, Error>> {
		const send = this.#send;
		if (!send) {
			const error = method === "exec" || method === "desktop"
				? new ExecutionError("unknown", "The workspace is offline")
				: new FileError("unknown", "The workspace is offline");
			return Promise.resolve(err(error));
		}
		const call = this.#next++;
		const signal = context.abortSignal;
		if (signal?.aborted) return Promise.resolve(err(new ExecutionError("aborted", "Aborted")));
		return new Promise((resolve) => {
			const abort = () => send({ cancel: call });
			signal?.addEventListener("abort", abort, { once: true });
			this.#pending.set(call, {
				resolve(result) {
					signal?.removeEventListener("abort", abort);
					resolve(result);
				},
				output,
			});
			send({ call, method, cwd, args: args.map(encode) });
		});
	}

	async desktop(request: DesktopRequest, context: Context): Promise<DesktopResult> {
		const result = await this.request("desktop", "", [request], context);
		if (!result.ok) throw result.error;
		return result.value as DesktopResult;
	}

	/** An execution environment at `cwd` on the workspace. `id` names the workspace's file namespace. */
	env(id: string, cwd: string): ExecutionEnv {
		const forward = (method: Method) => (...params: unknown[]) => {
			const context = params.pop() as Context;
			return this.request(method, cwd, params, context);
		};
		const env = Object.fromEntries(
			METHODS.map((method) => [method, forward(method)]),
		) as unknown as ExecutionEnv;
		return Object.assign(env, {
			id,
			cwd,
			exec: (command: string, options: Parameters<ExecutionEnv["exec"]>[1], context: Context) => {
				const { onOutput, ...rest } = options ?? {};
				return this.request(
					"exec",
					cwd,
					[command, rest],
					context,
					onOutput && ((text) => onOutput(text, context)),
				);
			},
			async openTextLineReader(path: string, context: Context) {
				const text = await env.readTextFile(path, context);
				if (!text.ok) return text;
				const lines = text.value.split("\n");
				const last = lines.pop();
				const queue = [
					...lines.map((line) => ({ text: line, terminated: true })),
					...(last ? [{ text: last, terminated: false }] : []),
				];
				const reader: TextLineReader = {
					readLine: async () => ok(queue.shift()),
					close: async () => {},
				};
				return ok(reader);
			},
			async cleanup() {},
		}) as ExecutionEnv;
	}
}

/** The workspace's side: run each call on a local environment and send back its outcome. */
export function serve(
	env: (cwd: string) => ExecutionEnv,
	send: (reply: Reply) => void,
	desktop?: Desktop,
) {
	const running = new Map<number, { abort: AbortController; done: Promise<void> }>();
	let closed = false;
	const handle = async (call: Call) => {
		if ("cancel" in call) return running.get(call.cancel)?.abort.abort();
		if (closed) {
			return send({
				call: call.call,
				result: err(failure(new Error("The workspace disconnected"))),
			});
		}
		if (call.method !== "desktop" && !METHODS.includes(call.method)) {
			return send({
				call: call.call,
				result: err(failure(new Error(`Unknown method ${call.method}`))),
			});
		}
		const abort = new AbortController();
		const { promise: done, resolve: finish } = Promise.withResolvers<void>();
		running.set(call.call, { abort, done });
		const context = withAbortSignal(abort.signal, BACKGROUND_CONTEXT);
		try {
			const args = call.args.map(decode);
			if (call.method === "desktop") {
				if (!desktop) throw new Error("Native desktop inspection is unavailable on this workspace");
				const value = await desktop(args[0] as DesktopRequest, context);
				return send({ call: call.call, result: ok(value) });
			}
			const target = env(call.cwd);
			const result = call.method === "exec"
				? await target.exec(args[0] as string, {
					...(args[1] as object),
					onOutput: (output) => send({ call: call.call, output }),
				}, context)
				: await (target[call.method] as (...a: unknown[]) => Promise<Result<unknown, Error>>).call(
					target,
					...args,
					context,
				);
			send({
				call: call.call,
				result: result.ok ? ok(encode(result.value)) : err(failure(result.error)),
			});
		} catch (error) {
			send({ call: call.call, result: err(failure(error)) });
		} finally {
			running.delete(call.call);
			finish();
		}
	};
	return Object.assign(handle, {
		async close() {
			closed = true;
			const calls = [...running.values()];
			for (const { abort } of calls) abort.abort();
			await Promise.all(calls.map(({ done }) => done));
		},
	});
}
