/**
 * The local boundary through which this host's channel workers discover and message the team's
 * channels. It lives in the host's data directory rather than on its port: `ace serve --port` and
 * desktop profiles choose ports workers never learn, but every worker shares its host's home.
 */
import { timingSafeEqual } from "node:crypto";
import { chmodSync, rmSync, statSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";

import type { Delivery } from "@ace/channel/protocol";

import { token } from "./auth";
import * as catalog from "./catalog";
import { attempt, request } from "./client";
import { config } from "./config";
import { lines } from "./lines";
import { failure, log } from "./log";
import type { AgentEnvelope, AgentFrame, AgentRequest, Listing } from "./protocol";

const CHANNEL = /^[0-9a-f]{16}$/;

const path = () => join(config.home, "host.sock");

/** Who hands a message to this host: its own owner's worker, or a peer host Tailscale verified. */
export type Sender = { login: string; relayed: boolean };

/**
 * The destination host authors an agent's message from its source channel and the sender's login.
 * The two `@` never equal a Tailscale login, so an agent is never taken for a channel's owner, and
 * the id is a reply address that outlives renames. A relaying peer asserts the source channel; only
 * its login is authenticated.
 */
export async function receive(sender: Sender, from: string, delivery: Delivery): Promise<unknown> {
	const { channel, chat, text, invoke, requestId } = delivery;
	if (typeof from !== "string" || !CHANNEL.test(from)) {
		throw new Error("An agent message must name its source channel's id");
	}
	if (typeof requestId !== "string" || !requestId.startsWith(`message:${from}:`)) {
		throw new Error("An agent message's request id must belong to its source channel");
	}
	if (typeof text !== "string") throw new Error("An agent message needs text");
	if (!catalog.owns(channel)) throw new Error(`No channel ${channel} on this host`);
	return request(channel, {
		op: invoke === true ? "ask" : "say",
		...(chat === undefined ? {} : { chat }),
		author: `agent.${from}@${sender.login}`,
		text,
		// pi deduplicates a chat's request ids whoever sends them, so one peer must not claim
		// another's. Local ids keep their recorded form so interrupted deliveries still replay once.
		requestId: sender.relayed
			? `peer/${encodeURIComponent(sender.login)}/${requestId}`
			: requestId,
	});
}

function isAbsent(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ECONNREFUSED";
}

/** A channel's answer to an admitted message, from this host or a peer. */
export function submitted(value: unknown): number {
	const submission = (value as { submission?: unknown } | null)?.submission;
	if (typeof submission !== "number") {
		throw new Error("The channel's host did not confirm delivery");
	}
	return submission;
}

type Handlers = {
	channels(): Promise<Listing[]>;
	deliver(from: string, delivery: Delivery): Promise<unknown>;
};

function bind(server: Server, file: string): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(file, () => {
			server.off("error", reject);
			resolve();
		});
	});
}

/** One host serves a home. A socket nobody answers on was left by a host that did not stop cleanly. */
async function claim(server: Server, file: string): Promise<void> {
	try {
		return await bind(server, file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
	}
	const conflict = new Error(`Another Ace host is serving ${config.home}`);
	const { ino } = statSync(file);
	try {
		(await attempt(file)).destroy();
	} catch (error) {
		if (!isAbsent(error)) throw error;
		// Another host recovering the same stale socket may have bound its own since the probe.
		if (statSync(file, { throwIfNoEntry: false })?.ino !== ino) throw conflict;
		rmSync(file);
		return bind(server, file);
	}
	throw conflict;
}

/** Serve this host's workers; returns the cleanup. */
export async function listen(handlers: Handlers): Promise<() => void> {
	const secret = Buffer.from(token());
	const file = path();
	const server = createServer((socket) => {
		socket.on("error", () => socket.destroy());
		lines(socket, async (line) => {
			const start = Date.now();
			let frame: AgentFrame;
			let fields = {};
			try {
				const { token: supplied, ...request } = JSON.parse(line) as AgentEnvelope;
				const given = Buffer.from(typeof supplied === "string" ? supplied : "");
				if (given.length !== secret.length || !timingSafeEqual(given, secret)) {
					throw new Error("Ace's host refused an unauthenticated agent request");
				}
				fields = { op: request.op };
				if (request.op === "channels") {
					frame = { ok: true, home: config.home, value: await handlers.channels() };
				} else if (request.op === "deliver") {
					const { op: _, from, ...delivery } = request;
					fields = { op: request.op, from, channel: delivery.channel, invoke: delivery.invoke };
					frame = { ok: true, home: config.home, value: await handlers.deliver(from, delivery) };
				} else {
					throw new Error("Unknown agent request");
				}
				log("info", "agents.request", { ...fields, ms: Date.now() - start });
			} catch (error) {
				log("warn", "agents.failed", { ...fields, ms: Date.now() - start, ...failure(error) });
				const message = error instanceof Error ? error.message : String(error);
				frame = { ok: false, home: config.home, error: message };
			}
			socket.end(`${JSON.stringify(frame)}\n`);
		});
	});
	await claim(server, file);
	chmodSync(file, 0o600);
	const { ino } = statSync(file);
	return () => {
		// While this listener is open no other host can claim the path, so unlink before closing.
		try {
			if (statSync(file).ino === ino) rmSync(file);
		} catch {}
		server.close();
	};
}

/**
 * Ask the host serving this worker's home. Undefined only when no host is listening, as in
 * CLI-only use; every answer the host gives, including refusals, reaches the caller.
 */
export async function ask(request: AgentRequest): Promise<{ value: unknown } | undefined> {
	let socket: Socket;
	try {
		socket = await attempt(path());
	} catch (error) {
		if (isAbsent(error)) return;
		throw error;
	}
	try {
		const reply = new Promise<string>((resolve, reject) => {
			lines(socket, resolve);
			socket.once("error", reject);
			socket.once("close", () => reject(new Error("Ace's host closed the agent connection")));
		});
		socket.write(`${JSON.stringify({ token: token(), ...request } satisfies AgentEnvelope)}\n`);
		const frame = JSON.parse(await reply) as AgentFrame;
		if (frame.home !== config.home) {
			throw new Error(`The host at ${path()} serves ${frame.home}, not ${config.home}`);
		}
		if (frame.ok === false) throw new Error(frame.error);
		if (frame.ok !== true || !("value" in frame)) {
			throw new Error("Ace's host sent an invalid reply");
		}
		return { value: frame.value };
	} finally {
		socket.destroy();
	}
}
