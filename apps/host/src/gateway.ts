import { existsSync, mkdirSync, watch } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import type { Server, ServerWebSocket } from "bun";

import * as catalog from "./catalog";
import { Connection } from "./client";
import * as directory from "./directory";
import { GatewayClient } from "./gateway-client";
import { seal } from "./keys";
import { archive, defaultModel, isRunning, models, project, remove } from "./manage";
import * as peers from "./peers";
import type { HostEnvelope, HostFrame, HostRequest, Listing } from "./protocol";
import { self, whois } from "./tailnet";
import * as workspace from "./workspace";

/** The built app; a packaged app points this at its bundled copy. */
const app = () => process.env.ACE_APP_DIR || new URL("../../app/dist", import.meta.url).pathname;

type Client = {
	/** The participant this socket speaks for: the owner on loopback, a verified login on the tailnet. */
	user: string;
	/** Arrived over the tailnet. Peers act only on this host's channels, and never as its owner. */
	peer: boolean;
	channels: Map<string, Promise<Connection>>;
	/** This client's connections to peer hosts, opened when it first uses one of their channels. */
	remotes: Map<string, GatewayClient>;
};

let name = hostname();

function local(): Listing[] {
	return catalog.list().map((record) => {
		const state = record.archived ? "archived" : isRunning(record.id) ? "running" : "dormant";
		const { id, name: channel, owner, project, model, created, hosted } = record;
		const listing: Listing = {
			id,
			host: name,
			name: channel,
			owner,
			project,
			model,
			created,
			state,
		};
		if (hosted) listing.hosted = hosted;
		return listing;
	});
}

/** Channels only the directory knows: their host is unreachable, unless they are hosted. */
function listed(seen: Set<string>): Listing[] {
	return directory.read().channels.filter((value) => !seen.has(value.id) && value.host !== name)
		.map((value) => ({
			...value,
			state: value.state === "archived" || value.hosted ? value.state : "offline",
		}));
}

function listings(client: Client): Listing[] {
	if (client.peer) return local();
	const reachable = [...local(), ...peers.listings()];
	return [...reachable, ...listed(new Set(reachable.map((value) => value.id)))];
}

const sockets = new Set<ServerWebSocket<Client>>();

function broadcast() {
	for (const socket of sockets) {
		socket.send(JSON.stringify({ channels: listings(socket.data) } satisfies HostFrame));
	}
}

function connection(client: Client, channel: string, hosted?: string): Promise<Connection> {
	let open = client.channels.get(channel);
	if (!open) {
		open = hosted ? Connection.hosted(hosted, channel) : Connection.open(channel);
		client.channels.set(channel, open);
		open.then((connection) => connection.closed.then(() => client.channels.delete(channel)), () => {
			client.channels.delete(channel);
		});
	}
	return open;
}

async function remote(client: Client, host: string): Promise<GatewayClient> {
	let open = client.remotes.get(host);
	if (!open) {
		const machine = peers.machine(host);
		if (!machine) throw new Error(`${host} is not reachable`);
		open = new GatewayClient(peers.url(machine));
		client.remotes.set(host, open);
	}
	for (let waited = 0; open.status !== "open"; waited += 50) {
		if (waited >= 5000) throw new Error(`${host} is not reachable`);
		await Bun.sleep(50);
	}
	return open;
}

const owned = new Set<HostRequest["op"]>(["archive", "delete"]);

async function handle(
	socket: ServerWebSocket<Client>,
	request: HostRequest,
	send: (frame: HostFrame) => void,
	id: number,
): Promise<unknown> {
	const client = socket.data;
	// A channel runs where it was created, so even its owner creates from that machine.
	if (client.peer && request.op === "create") {
		throw new Error("Create channels from the host that will run them");
	}
	if (owned.has(request.op) && client.user !== catalog.user) {
		throw new Error("Only this host's owner can do that");
	}
	switch (request.op) {
		case "hello":
			return { user: client.user, host: name };
		case "channels":
			return listings(client);
		case "models":
			if (request.host && request.host !== name && !client.peer) {
				return (await remote(client, request.host)).request({ op: "models" });
			}
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
			if (catalog.owns(request.channel)) {
				if (request.request.op === "kill" && client.user !== catalog.user) {
					throw new Error("Only the channel's owner can kill it");
				}
				const forwarded = "author" in request.request
					? { ...request.request, author: client.user }
					: request.request;
				const target = await connection(client, request.channel);
				return target.request(forwarded, (event) => send({ id, event }));
			}
			const machine = !client.peer && peers.find(request.channel);
			const hosted = !client.peer && !machine
				&& directory.read().channels.find((value) => value.id === request.channel && value.hosted);
			if (hosted) {
				if (request.request.op === "kill" && client.user !== hosted.owner) {
					throw new Error("Only the channel's owner can kill it");
				}
				const forwarded = "author" in request.request
					? { ...request.request, author: client.user }
					: request.request;
				const target = await connection(client, request.channel, hosted.hosted);
				return target.request(forwarded, (event) => send({ id, event }));
			}
			if (!machine) throw new Error("No reachable host runs that channel");
			const target = await remote(client, machine.name);
			return target.channel(request.channel, request.request, (event) => send({ id, event }));
		}
		case "release": {
			const open = client.channels.get(request.channel);
			client.channels.delete(request.channel);
			if (open) return void (await open).close();
			const machine = peers.find(request.channel);
			const target = machine && client.remotes.get(machine.name);
			if (target?.status === "open") await target.request(request);
			return;
		}
	}
}

function websocket(): Bun.WebSocketHandler<Client> {
	return {
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
		close(socket) {
			sockets.delete(socket);
			for (const open of socket.data.channels.values()) {
				open.then((connection) => connection.close(), () => {});
			}
			for (const remote of socket.data.remotes.values()) remote.close();
		},
	};
}

function client(user: string, peer: boolean): Client {
	return { user, peer, channels: new Map(), remotes: new Map() };
}

/** The owner's listener: loopback only, serving the app. */
function owner(port: number): Server<Client> {
	return Bun.serve<Client>({
		port,
		hostname: "127.0.0.1",
		async fetch(request, server) {
			const url = new URL(request.url);
			if (url.pathname === "/ws") {
				return server.upgrade(request, { data: client(catalog.user, false) })
					? undefined
					: new Response("Upgrade failed", { status: 400 });
			}
			const dir = app();
			if (!existsSync(dir)) {
				return new Response("The app is not built; run bun app build", { status: 404 });
			}
			const file = Bun.file(join(dir, url.pathname));
			if (url.pathname !== "/" && await file.exists()) return new Response(file);
			return new Response(Bun.file(join(dir, "index.html")));
		},
		websocket: websocket(),
	});
}

/**
 * The team's listener on this machine's tailnet address. Tailscale names the person behind each
 * connection. It serves only host-to-host sockets: browsers always send an Origin, and a page on
 * a teammate's machine must not act as them.
 */
function team(port: number, address: string): Server<Client> {
	return Bun.serve<Client>({
		port,
		hostname: address,
		async fetch(request, server) {
			if (new URL(request.url).pathname !== "/ws" || request.headers.has("origin")) {
				return new Response("Not found", { status: 404 });
			}
			const ip = server.requestIP(request);
			if (!ip) return new Response("Forbidden", { status: 403 });
			let user: string;
			try {
				user = await whois(ip.address, ip.port);
			} catch {
				return new Response("Forbidden", { status: 403 });
			}
			return server.upgrade(request, { data: client(user, true) })
				? undefined
				: new Response("Upgrade failed", { status: 400 });
		},
		websocket: websocket(),
	});
}

export async function serve(port: number): Promise<never> {
	// Hosted channels run tools in this process.
	seal();
	const server = owner(port);
	console.log(`Ace on http://${server.hostname}:${server.port}`);
	const machine = await self();
	if (machine) name = machine.name;
	const address = machine ? { address: machine.address } : {};
	const publish = directory.watch({ name, login: catalog.user, ...address }, local, broadcast);
	if (machine) {
		team(port, machine.address);
		console.log(`Sharing with the tailnet on ${machine.address}:${port} as ${machine.login}`);
		peers.watch(broadcast);
	} else {
		console.log("Tailscale is not running; channels stay on this machine");
	}
	mkdirSync(join(catalog.home, "channels"), { recursive: true });
	// Workers create and remove their sockets; tell clients when a channel starts or retires.
	watch(join(catalog.home, "channels"), { recursive: true }, (_, file) => {
		if (file?.endsWith("channel.sock") || file?.endsWith("channel.json")) broadcast();
		if (file?.endsWith("channel.json")) {
			workspace.sync();
			void publish();
		}
	});
	workspace.sync();
	return new Promise(() => {});
}
