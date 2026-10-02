import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { connect as dial, type Socket } from "node:net";

import type { Event, Frame, Request } from "@ace/channel/protocol";

import * as catalog from "./catalog";
import { key } from "./keys";
import { lines } from "./lines";

/** The worker's entry; a packaged app points this at its bundled copy. */
const worker = () => process.env.ACE_WORKER || new URL("./worker.ts", import.meta.url).pathname;

function start(id: string): void {
	const log = openSync(catalog.paths(id).log, "a");
	const child = spawn(process.execPath, [worker(), id], {
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

type Transport = {
	write(text: string): void;
	end(): void;
	closed: Promise<void>;
};

function local(socket: Socket, receive: (text: string) => void): Transport {
	lines(socket, receive);
	return {
		write: (text) => socket.write(`${text}\n`),
		end: () => socket.end(),
		closed: new Promise((resolve) => socket.once("close", () => resolve())),
	};
}

/** Hosts share the team's secret with the hosting service; see services/channel. */
export async function hostedAuth(): Promise<Record<string, string>> {
	const secret = await key("ACE_HOSTED_SECRET");
	if (!secret) throw new Error("Hosted channels need ACE_HOSTED_SECRET; see ace key set");
	return { authorization: `Bearer ${secret}` };
}

export async function hostedSocket(base: string, path: string): Promise<WebSocket> {
	const socket = new WebSocket(`${base.replace(/^http/, "ws")}${path}`, {
		headers: await hostedAuth(),
	} as unknown as string[]);
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve, { once: true });
		socket.addEventListener("error", () => reject(new Error(`Cannot reach ${base}`)), {
			once: true,
		});
	});
	return socket;
}

async function hosted(
	record: catalog.Listing,
	receive: (text: string) => void,
): Promise<Transport> {
	const socket = await hostedSocket(record.hosted!, `/channels/${record.id}`);
	socket.addEventListener("message", ({ data }) => receive(String(data)));
	return {
		write: (text) => socket.send(text),
		end: () => socket.close(),
		closed: new Promise((resolve) => socket.addEventListener("close", () => resolve())),
	};
}

/** A connection to a channel: its local worker, started if dormant, or its hosting service. */
export class Connection {
	#transport!: Transport;
	#next = 1;
	#pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	#watchers = new Map<number, (event: Event) => void>();
	closed!: Promise<void>;

	private constructor() {}

	static async #connect(open: (receive: (text: string) => void) => Promise<Transport>) {
		const connection = new Connection();
		connection.#transport = await open((text) => connection.#receive(JSON.parse(text)));
		connection.closed = connection.#transport.closed;
		connection.closed.then(() => {
			for (const { reject } of connection.#pending.values()) {
				reject(new Error("The channel closed the connection"));
			}
		});
		return connection;
	}

	static async open(id: string): Promise<Connection> {
		const record = catalog.read(id);
		if (record.hosted) return Connection.#connect((receive) => hosted(record, receive));
		const { socket } = catalog.paths(id);
		let started = false;
		for (let wait = 50; wait < 10_000; wait *= 1.5) {
			try {
				const connected = await attempt(socket);
				return Connection.#connect(async (receive) => local(connected, receive));
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
		this.#transport.write(JSON.stringify({ id, ...request }));
		return new Promise((resolve, reject) =>
			this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
		);
	}

	close(): void {
		this.#transport.end();
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
