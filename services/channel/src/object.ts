import { DurableObject } from "cloudflare:workers";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

import { Channel, type Envelope, type Frame, type Log, type ModelRef } from "@ace/channel";
import { type Call, Link, type Reply, type WorkspaceMessage } from "@ace/channel/workspace";

import { DurableSqlite } from "./storage";

export type Env = {
	CHANNEL: DurableObjectNamespace<HostedChannel>;
	/** Bearer secret shared by the team's hosts. */
	ACE_SECRET?: string;
};

/** Paths are on the workspace host, whose file namespace is `workspace`. */
export type Config = {
	version: 2;
	id: string;
	name: string;
	prefix: string;
	named: boolean;
	owner: string;
	project: string;
	lanes: string;
	model?: ModelRef;
	workspace: string;
};

const KEEPALIVE = 30_000;

/** Workers Logs indexes JSON fields, so lines search by the same ids as hosts' log files. */
const log: Log = (level, event, fields) => {
	const line = { level, event, ...fields };
	if (level === "error") console.error(line);
	else if (level === "warn") console.warn(line);
	else console.log(line);
};

/**
 * One hosted channel. Its history and agents live here; its tools run on the workspace host that
 * holds the `workspace` socket. That socket hibernates, so an idle channel costs nothing while the
 * host stays connected. Client sockets stream live pi events and keep the object awake.
 */
export class HostedChannel extends DurableObject<Env> {
	#link = new Link(crypto.randomUUID());
	#channel?: Promise<Channel>;

	#config(): Config | undefined {
		const config = this.ctx.storage.kv.get<
			Omit<Config, "version" | "prefix" | "named"> & Partial<Pick<Config, "prefix" | "named">> & {
				version?: number;
			}
		>(
			"config",
		);
		if (!config) return;
		if (config.version !== undefined && config.version !== 1 && config.version !== 2) {
			throw new Error(`Unsupported channel config version ${config.version}`);
		}
		if (config.version === 2) return config as Config;
		return { ...config, version: 2, prefix: config.name, named: true };
	}

	#project(message: WorkspaceMessage) {
		const frame = JSON.stringify(message);
		for (const socket of this.ctx.getWebSockets("workspace")) {
			if (socket.readyState === WebSocket.OPEN) socket.send(frame);
		}
	}

	#attach(socket: WebSocket) {
		this.#link.attach((call: Call) => socket.send(JSON.stringify(call)));
	}

	#open(config: Config): Promise<Channel> {
		this.#channel ??= (async () => {
			const [socket] = this.ctx.getWebSockets("workspace");
			if (socket && !this.#link.attached) this.#attach(socket);
			const env = this.env as unknown as Record<string, unknown>;
			const envs = new Map<string, ReturnType<Link["env"]>>();
			return Channel.open({
				...config,
				onMetadata: (metadata) => this.#project({ metadata }),
				onActivity: (active) => this.#project({ active }),
				storage: await SqliteStorage.open(new DurableSqlite(this.ctx.storage)),
				models: builtinModels({
					authContext: {
						env: async (name) => typeof env[name] === "string" ? env[name] : undefined,
						fileExists: async () => false,
					},
				}),
				desktop: (request, context) => this.#link.desktop(request, context),
				env: (cwd) => {
					let found = envs.get(cwd);
					if (!found) envs.set(cwd, found = this.#link.env(config.workspace, cwd));
					return found;
				},
				directory: {
					self: { id: config.id, name: config.prefix },
					list: async () => [],
					deliver: async () => {
						throw new Error("Hosted channels cannot message other channels yet");
					},
				},
				log,
			});
		})();
		return this.#channel;
	}

	/** Pi resumes interrupted work when it opens, so an alarm during a run brings an evicted object back. */
	async #keepalive() {
		if (!(await this.ctx.storage.getAlarm())) {
			await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE);
		}
	}

	override async alarm() {
		const config = this.#config();
		if (!config) return;
		const channel = await this.#open(config);
		if (!(await channel.isIdle())) await this.#keepalive();
	}

	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const workspace = url.pathname.endsWith("/workspace");
		if (request.method === "POST") {
			if (!this.#config()) this.ctx.storage.kv.put("config", await request.json<Config>());
			return Response.json(await (await this.#open(this.#config()!)).info());
		}
		const config = this.#config();
		if (!config) return new Response("No such channel", { status: 404 });
		if (request.method === "DELETE") {
			const channel = await this.#open(config);
			await channel.kill();
			await channel.close();
			this.#channel = undefined;
			for (const socket of this.ctx.getWebSockets()) socket.close(1000, "deleted");
			await this.ctx.storage.deleteAll();
			return new Response(null, { status: 204 });
		}
		if (request.headers.get("upgrade") !== "websocket") {
			return Response.json(await (await this.#open(config)).info());
		}
		const { 0: client, 1: server } = new WebSocketPair();
		if (workspace) {
			for (const old of this.ctx.getWebSockets("workspace")) old.close(1000, "replaced");
			log("info", "workspace.connect", { channel: config.id, workspace: config.workspace });
			this.ctx.acceptWebSocket(server, ["workspace"]);
			this.#attach(server);
			const { name, summary, revision } = await (await this.#open(config)).info();
			this.#project({ metadata: { name, summary, revision } });
		} else {
			server.accept();
			this.#serve(server, await this.#open(config));
		}
		return new Response(null, { status: 101, webSocket: client });
	}

	override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
		if (!this.#link.attached) this.#attach(socket);
		this.#link.receive(JSON.parse(message as string) as Reply);
	}

	override async webSocketClose(socket: WebSocket, code: number, reason: string) {
		log("warn", "workspace.drop", { channel: this.#config()?.id, code, reason });
		if (this.ctx.getWebSockets("workspace").every((open) => open === socket)) this.#link.detach();
	}

	#serve(socket: WebSocket, channel: Channel) {
		const watches: { stop(): Promise<unknown> }[] = [];
		const send = (frame: Frame) => socket.send(JSON.stringify(frame));
		socket.addEventListener("close", () => {
			for (const watch of watches) watch.stop();
		});
		socket.addEventListener("message", async ({ data }) => {
			const { id, trace, ...body } = JSON.parse(data as string) as Envelope;
			try {
				const value = await channel.handle(body, (event) => send({ id, event }), trace);
				if (body.op === "watch") watches.push(value as { stop(): Promise<unknown> });
				if (body.op === "ask") await this.#keepalive();
				send({ id, ok: true, value: body.op === "watch" ? null : value ?? null });
			} catch (error) {
				send({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		});
	}
}
