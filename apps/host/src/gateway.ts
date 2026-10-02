import { existsSync, mkdirSync, watch } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import type { ServerWebSocket } from "bun";

import * as catalog from "./catalog";
import { Connection } from "./client";
import { archive, defaultModel, isRunning, models, project, remove } from "./manage";
import type { HostEnvelope, HostFrame, HostRequest, Listing } from "./protocol";

const app = new URL("../../app/dist", import.meta.url).pathname;

type Client = {
	/** The participant this socket speaks for. Local for now; the tailnet will verify remote peers. */
	user: string;
	channels: Map<string, Promise<Connection>>;
};

function listings(): Listing[] {
	return catalog.list().map((record) => {
		const state = record.archived ? "archived" : isRunning(record.id) ? "running" : "dormant";
		const { id, name, owner, project, model, created } = record;
		return { id, name, owner, project, model, created, state };
	});
}

const sockets = new Set<ServerWebSocket<Client>>();

function broadcast() {
	const frame = JSON.stringify({ channels: listings() } satisfies HostFrame);
	for (const socket of sockets) socket.send(frame);
}

function connection(client: Client, channel: string): Promise<Connection> {
	let open = client.channels.get(channel);
	if (!open) {
		open = Connection.open(channel);
		client.channels.set(channel, open);
		open.then((connection) => connection.closed.then(() => client.channels.delete(channel)), () => {
			client.channels.delete(channel);
		});
	}
	return open;
}

async function handle(
	socket: ServerWebSocket<Client>,
	request: HostRequest,
	send: (frame: HostFrame) => void,
	id: number,
): Promise<unknown> {
	const client = socket.data;
	switch (request.op) {
		case "hello":
			return { user: client.user, host: hostname() };
		case "channels":
			return listings();
		case "models":
			return models();
		case "create": {
			const model = request.model || await defaultModel();
			const record = catalog.create(project(request.project), model, request.name || undefined);
			broadcast();
			return record;
		}
		case "archive":
			await archive(request.channel, request.archived);
			return broadcast();
		case "delete":
			await remove(request.channel);
			return broadcast();
		case "channel": {
			const forwarded = "author" in request.request
				? { ...request.request, author: client.user }
				: request.request;
			const target = await connection(client, request.channel);
			return target.request(forwarded, (event) => send({ id, event }));
		}
		case "release": {
			const open = client.channels.get(request.channel);
			client.channels.delete(request.channel);
			(await open)?.close();
			return;
		}
	}
}

export function serve(port: number): Promise<never> {
	const server = Bun.serve<Client>({
		port,
		hostname: process.env.ACE_BIND || "127.0.0.1",
		async fetch(request, server) {
			const url = new URL(request.url);
			if (url.pathname === "/ws") {
				const data: Client = { user: catalog.user, channels: new Map() };
				return server.upgrade(request, { data })
					? undefined
					: new Response("Upgrade failed", { status: 400 });
			}
			if (!existsSync(app)) {
				return new Response("The app is not built; run bun app build", { status: 404 });
			}
			const file = Bun.file(join(app, url.pathname));
			if (url.pathname !== "/" && await file.exists()) return new Response(file);
			return new Response(Bun.file(join(app, "index.html")));
		},
		websocket: {
			open(socket) {
				sockets.add(socket);
			},
			async message(socket, raw) {
				const { id, ...request } = JSON.parse(String(raw)) as HostEnvelope;
				const send = (frame: HostFrame) =>
					socket.readyState === 1 && socket.send(JSON.stringify(frame));
				try {
					const value = await handle(socket, request, send, id);
					send({ id, ok: true, value: value ?? null });
				} catch (error) {
					send({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
				}
			},
			async close(socket) {
				sockets.delete(socket);
				for (const open of socket.data.channels.values()) {
					open.then((connection) => connection.close(), () => {});
				}
			},
		},
	});
	mkdirSync(join(catalog.home, "channels"), { recursive: true });
	// Workers create and remove their sockets; tell clients when a channel starts or retires.
	watch(join(catalog.home, "channels"), { recursive: true }, (_, file) => {
		if (file?.endsWith("channel.sock") || file?.endsWith("channel.json")) broadcast();
	});
	console.log(`Ace on http://${server.hostname}:${server.port}`);
	return new Promise(() => {});
}
