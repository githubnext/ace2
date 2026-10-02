import { existsSync, mkdirSync, watch } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import type { Server, ServerWebSocket } from "bun";

import * as auth from "./auth";
import * as catalog from "./catalog";
import { Connection } from "./client";
import { config } from "./config";
import { diagnostics } from "./diagnostics";
import * as directory from "./directory";
import { GatewayClient } from "./gateway-client";
import { seal } from "./keys";
import { failure, log, open as openLog } from "./log";
import { archive, defaultModel, isRunning, models, project, remove } from "./manage";
import * as peers from "./peers";
import * as projects from "./projects";
import {
	HOST_PROTOCOL,
	type HostEnvelope,
	type HostFrame,
	type HostInfo,
	type HostRequest,
	type Listing,
} from "./protocol";
import { self, whois } from "./tailnet";
import { checkKey, removeKey, setKey, setModel, settings } from "./settings";
import { shutdown } from "./shutdown";
import * as terminals from "./terminals";
import * as workspace from "./workspace";

type Client = {
	/** The participant this socket speaks for: the owner on loopback, a verified login on the tailnet. */
	user: string;
	/** Arrived over the tailnet. Peers act only on this host's channels, and never as its owner. */
	peer: boolean;
	channels: Map<string, Promise<Connection>>;
	/** This client's connections to peer hosts, opened when it first uses one of their channels. */
	remotes: Map<string, GatewayClient>;
	/** Detaches this client from the terminals it opened; the shells keep running. */
	terminals: Map<string, () => void>;
};

let name = hostname();
let closing = false;
const pending = new Set<Promise<unknown>>();

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
		.map((value) =>
			Object.assign({}, value, {
				state: value.state === "archived" || value.hosted ? value.state : "offline" as const,
			})
		);
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

function projectsChanged(): void {
	const frame = JSON.stringify({ projects: projects.list() } satisfies HostFrame);
	for (const socket of sockets) if (!socket.data.peer) socket.send(frame);
}

function settingsChanged(): void {
	for (const socket of sockets) {
		if (!socket.data.peer) socket.send(JSON.stringify({ settings: true } satisfies HostFrame));
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
const localOps = new Set<HostRequest["op"]>([
	"projects",
	"project-open",
	"settings",
	"diagnostics",
	"key-set",
	"key-check",
	"key-remove",
	"preferences",
	// A terminal is a shell as this host's user, so only its owner opens one.
	"terminal",
	"terminal-input",
	"terminal-resize",
	"terminal-close",
]);

async function handle(
	socket: ServerWebSocket<Client>,
	request: HostRequest,
	send: (frame: HostFrame) => void,
	id: number,
	trace: string,
): Promise<unknown> {
	if (closing) throw new Error("Ace Helper is shutting down");
	const client = socket.data;
	if (localOps.has(request.op) && (client.peer || client.user !== catalog.user)) {
		throw new Error("This action is only available from this host's local app");
	}
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
		case "projects":
			return projects.list();
		case "project-open": {
			const project = projects.open(request.path);
			projectsChanged();
			return project;
		}
		case "settings":
			return settings();
		case "diagnostics":
			return diagnostics();
		case "key-set":
			await setKey(request.provider, request.value);
			return settingsChanged();
		case "key-check":
			return checkKey(request.provider);
		case "key-remove":
			await removeKey(request.provider);
			return settingsChanged();
		case "preferences":
			await setModel(request.model);
			return settingsChanged();
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
			if (request.archived) terminals.closeChannel(request.channel);
			await archive(request.channel, request.archived);
			return broadcast();
		case "delete":
			terminals.closeChannel(request.channel);
			await remove(request.channel);
			return broadcast();
		case "terminal": {
			if (!catalog.owns(request.channel)) throw new Error("Terminals open on the channel's host");
			const { opened, attach } = await terminals.open(request);
			client.terminals.get(opened.terminal)?.();
			// After the reply, which is sent once this returns and its microtasks settle.
			setTimeout(() => {
				if (socket.readyState === 1) client.terminals.set(opened.terminal, attach(send));
			});
			return opened;
		}
		case "terminal-input":
			return terminals.input(request.terminal, request.data);
		case "terminal-resize":
			return terminals.resize(request.terminal, request.cols, request.rows);
		case "terminal-close":
			client.terminals.delete(request.terminal);
			return terminals.close(request.terminal);
		case "channel": {
			if (catalog.owns(request.channel)) {
				if (request.request.op === "kill") {
					if (client.user !== catalog.user) throw new Error("Only the channel's owner can kill it");
					terminals.closeChannel(request.channel);
				}
				const forwarded = "author" in request.request
					? { ...request.request, author: client.user }
					: request.request;
				const target = await connection(client, request.channel);
				return target.request(forwarded, (event) => send({ id, event }), trace);
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
				return target.request(forwarded, (event) => send({ id, event }), trace);
			}
			if (!machine) throw new Error("No reachable host runs that channel");
			const target = await remote(client, machine.name);
			return target.channel(
				request.channel,
				request.request,
				(event) => send({ id, event }),
				trace,
			);
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
			log("info", "gateway.open", { user: socket.data.user, peer: socket.data.peer });
			if (!socket.data.peer) {
				socket.send(JSON.stringify({ projects: projects.list() } satisfies HostFrame));
			}
		},
		async message(socket, raw) {
			const { id, trace: given, ...request } = JSON.parse(String(raw)) as HostEnvelope;
			// A peer host's trace continues here, so one request reads across both machines' logs.
			const trace = given || crypto.randomUUID().slice(0, 8);
			const send = (frame: HostFrame) =>
				socket.readyState === 1 && socket.send(JSON.stringify(frame));
			const start = Date.now();
			const fields = {
				trace,
				user: socket.data.user,
				peer: socket.data.peer,
				op: request.op,
				...("channel" in request ? { channel: request.channel } : {}),
				...(request.op === "channel" ? { request: request.request.op } : {}),
			};
			// Listing and watching repeat constantly; everything else is a deliberate action.
			const quiet = request.op === "channels" || request.op === "projects"
				|| request.op === "hello" || request.op === "models"
				|| request.op === "release" || request.op === "terminal-input"
				|| request.op === "terminal-resize"
				|| (request.op === "channel" && ["watch", "info", "models"].includes(request.request.op));
			const handling = handle(socket, request, send, id, trace);
			pending.add(handling);
			try {
				const value = await handling;
				log(quiet ? "debug" : "info", "gateway.request", { ...fields, ms: Date.now() - start });
				send({ id, ok: true, value: value ?? null });
			} catch (error) {
				log("warn", "gateway.failed", { ...fields, ms: Date.now() - start, ...failure(error) });
				send({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
			} finally {
				pending.delete(handling);
			}
		},
		close(socket, code) {
			sockets.delete(socket);
			log("info", "gateway.close", { user: socket.data.user, peer: socket.data.peer, code });
			for (const open of socket.data.channels.values()) {
				open.then((connection) => connection.close(), () => {});
			}
			for (const remote of socket.data.remotes.values()) remote.close();
			for (const detach of socket.data.terminals.values()) detach();
		},
	};
}

function client(user: string, peer: boolean): Client {
	return { user, peer, channels: new Map(), remotes: new Map(), terminals: new Map() };
}

/** The owner's listener: loopback only, serving the app. */
function owner(port: number): Server<Client> {
	const access = auth.owner(port);
	return Bun.serve<Client>({
		port,
		hostname: "127.0.0.1",
		async fetch(request, server) {
			if (!access.accepts(request)) return new Response("Forbidden", { status: 403 });
			const url = new URL(request.url);
			if (url.pathname === "/health") {
				const challenge = request.headers.get("x-ace-challenge");
				if (challenge && !/^[a-f0-9]{64}$/.test(challenge)) {
					return new Response("Bad challenge", { status: 400 });
				}
				const info: HostInfo = {
					app: "ace",
					protocol: HOST_PROTOCOL,
					home: catalog.home,
					pid: process.pid,
					helper: config.helper,
				};
				return Response.json(info, {
					headers: challenge ? { "x-ace-proof": access.proof(info, challenge) } : undefined,
				});
			}
			if (url.pathname === "/ws") {
				if (!access.authorizes(request)) return new Response("Unauthorized", { status: 401 });
				const protocols = request.headers.get("sec-websocket-protocol")?.split(",").map((value) =>
					value.trim()
				);
				return server.upgrade(request, {
						data: client(catalog.user, false),
						headers: {
							"set-cookie": access.cookie,
							...(protocols?.includes("ace") ? { "sec-websocket-protocol": "ace" } : {}),
						},
					})
					? undefined
					: new Response("Upgrade failed", { status: 400 });
			}
			const dir = config.app;
			if (!existsSync(dir)) {
				return new Response("The app is not built; run bun app build", { status: 404 });
			}
			const file = Bun.file(join(dir, url.pathname));
			const headers = {
				"Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
				"Referrer-Policy": "no-referrer",
				"X-Content-Type-Options": "nosniff",
			};
			if (url.pathname !== "/" && await file.exists()) return new Response(file, { headers });
			return new Response(Bun.file(join(dir, "index.html")), { headers });
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
			} catch (error) {
				log("warn", "gateway.whois", { address: ip.address, ...failure(error) });
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
	config.port = port;
	// Hosted channels run tools in this process.
	seal();
	openLog("host");
	const server = owner(port);
	log("info", "host.start", { port: server.port, user: catalog.user, bun: Bun.version });
	const servers = [server];
	const cleanup: (() => void)[] = [];
	async function stop() {
		if (closing) return;
		closing = true;
		log("info", "host.stop", { pending: pending.size });
		for (const close of cleanup) close();
		terminals.closeAll();
		await Promise.allSettled(servers.map((server) => server.stop(true)));
		await Promise.allSettled(pending);
		const results = await Promise.allSettled([workspace.close(), shutdown()]);
		for (const result of results) {
			if (result.status === "rejected") {
				log("error", "host.shutdown.failed", failure(result.reason));
			}
		}
		process.exit(results.some((result) => result.status === "rejected") ? 1 : 0);
	}
	process.on("SIGTERM", () => void stop());
	process.on("SIGINT", () => void stop());
	console.log(`Ace on http://${server.hostname}:${server.port}`);
	const machine = await self();
	if (closing) return new Promise(() => {});
	if (machine) name = machine.name;
	const address = machine ? { address: machine.address } : {};
	const publish = directory.watch({ name, login: catalog.user, ...address }, local, broadcast);
	log("info", "host.tailnet", machine ? { name, address: machine.address } : { tailscale: false });
	cleanup.push(publish.stop);
	if (machine) {
		servers.push(team(port, machine.address));
		console.log(`Sharing with the tailnet on ${machine.address}:${port} as ${machine.login}`);
		cleanup.push(peers.watch(broadcast));
	} else {
		console.log("Tailscale is not running; channels stay on this machine");
	}
	mkdirSync(join(catalog.home, "channels"), { recursive: true });
	// Workers create and remove their sockets; tell clients when a channel starts or retires.
	const watcher = watch(join(catalog.home, "channels"), { recursive: true }, (_, file) => {
		if (closing) return;
		if (file?.endsWith("channel.sock") || file?.endsWith("channel.json")) broadcast();
		if (file?.endsWith("channel.json")) {
			projectsChanged();
			workspace.sync();
			void publish.sync();
		}
	});
	cleanup.push(() => watcher.close());
	workspace.sync();
	return new Promise(() => {});
}
