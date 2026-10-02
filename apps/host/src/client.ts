import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { connect as dial, type Socket } from "node:net";

import type { Event, Frame, Request } from "@ace/channel/protocol";

import * as catalog from "./catalog";
import { lines } from "./lines";

const worker = new URL("./worker.ts", import.meta.url).pathname;

function start(id: string): void {
	const log = openSync(catalog.paths(id).log, "a");
	const child = spawn(process.execPath, [worker, id], {
		detached: true,
		stdio: ["ignore", log, log],
	});
	child.unref();
}

function attempt(path: string): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = dial(path);
		socket.once("connect", () => resolve(socket));
		socket.once("error", reject);
	});
}

/** A connection to a channel's worker, starting the worker if the channel is dormant. */
export class Connection {
	#socket: Socket;
	#next = 1;
	#pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	#watchers = new Map<number, (event: Event) => void>();
	readonly closed: Promise<void>;

	private constructor(socket: Socket) {
		this.#socket = socket;
		lines(socket, (line) => this.#receive(JSON.parse(line)));
		this.closed = new Promise((resolve) => socket.once("close", () => resolve()));
		this.closed.then(() => {
			for (const { reject } of this.#pending.values()) {
				reject(new Error("The channel closed the connection"));
			}
		});
	}

	static async open(id: string): Promise<Connection> {
		const { socket } = catalog.paths(id);
		let started = false;
		for (let wait = 50; wait < 10_000; wait *= 1.5) {
			try {
				return new Connection(await attempt(socket));
			} catch {
				if (!started) start(id);
				started = true;
				await Bun.sleep(wait);
			}
		}
		throw new Error(`The channel worker did not start; see ${catalog.paths(id).log}`);
	}

	request<T = unknown>(request: Request, watch?: (event: Event) => void): Promise<T> {
		const id = this.#next++;
		if (watch) this.#watchers.set(id, watch);
		this.#socket.write(`${JSON.stringify({ id, ...request })}\n`);
		return new Promise((resolve, reject) =>
			this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
		);
	}

	close(): void {
		this.#socket.end();
	}

	#receive(frame: Frame) {
		if ("event" in frame) return this.#watchers.get(frame.id)?.(frame.event);
		const pending = this.#pending.get(frame.id);
		this.#pending.delete(frame.id);
		if (frame.ok) return pending?.resolve(frame.value);
		pending?.reject(new Error(frame.error));
	}
}

export async function request<T = unknown>(id: string, body: Request): Promise<T> {
	const connection = await Connection.open(id);
	try {
		return await connection.request<T>(body);
	} finally {
		connection.close();
	}
}
