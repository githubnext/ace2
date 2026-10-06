import { closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createServer, type Socket } from "node:net";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

import { Channel, type Destination, type Envelope, type Frame } from "@ace/channel";

import * as agents from "./agents";
import * as catalog from "./catalog";
import { desktop } from "./desktop";
import { models, seal } from "./keys";
import { defaultModel } from "./manage";
import { lines } from "./lines";
import { log, open } from "./log";
import type { Listing, WorkerInfo, WorkerRequest } from "./protocol";

const RETIRE_AFTER = 10 * 60_000;
const OFFLINE =
	"Ace's host is not running on this machine, so only its own channels are reachable. Open Ace or run ace serve to reach peer hosts.";

seal();

const id = process.argv[2];
open(`channel-${id}`, { channel: id });
const record = catalog.read(id);
const paths = catalog.paths(id);

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** One worker owns a channel's storage. A live owner's pid file turns this process away. */
function lock(): boolean {
	try {
		const fd = openSync(paths.pid, "wx");
		writeSync(fd, String(process.pid));
		closeSync(fd);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		const owner = Number(readFileSync(paths.pid, "utf8"));
		if (isRunning(owner)) return false;
		rmSync(paths.pid, { force: true });
		return lock();
	}
}

if (!lock()) {
	log("info", "worker.redundant", { owner: Number(readFileSync(paths.pid, "utf8")) });
	process.exit(0);
}
log("info", "worker.start", { bun: Bun.version });
rmSync(paths.socket, { force: true });
catalog.busy(id, false);

const envs = new Map<string, NodeExecutionEnv>();
const channel = await Channel.open({
	id,
	name: record.name,
	prefix: record.prefix,
	named: record.named,
	onMetadata: (value) => catalog.metadata(id, value),
	onActivity: (at) => catalog.activity(id, at),
	onBusy: (busy) => catalog.busy(id, busy),
	owner: record.owner,
	project: record.project,
	lanes: paths.lanes,
	model: record.model,
	defaultModel,
	storage: await openNodeSqliteStorage(paths.storage),
	models: models(),
	desktop,
	env(cwd) {
		let env = envs.get(cwd);
		if (!env) envs.set(cwd, env = new NodeExecutionEnv({ cwd }));
		return env;
	},
	// The host reaches peers; without one, as in CLI-only use, agents reach this machine's channels.
	directory: {
		self: { id },
		async list() {
			const answer = await agents.ask({ op: "channels" });
			if (!answer) {
				const channels: Destination[] = catalog.list()
					.filter((other) => other.id !== id && !other.archived)
					.map(({ id, name, owner, project, summary }) => ({ id, name, owner, project, summary }));
				return { channels, note: OFFLINE };
			}
			if (!Array.isArray(answer.value)) throw new Error("Ace's host sent an invalid channel list");
			const channels: Destination[] = (answer.value as Listing[])
				.filter((other) => other.id !== id && other.state !== "archived")
				.map(({ id, name, host, owner, project, repo, state, summary }) => ({
					id,
					name,
					host,
					owner,
					project,
					repo,
					state,
					summary,
				}));
			return { channels };
		},
		async deliver(delivery) {
			const answer = await agents.ask({ op: "deliver", from: id, ...delivery });
			if (answer) return void agents.submitted(answer.value);
			if (!catalog.owns(delivery.channel)) throw new Error(OFFLINE);
			agents.submitted(
				await agents.receive({ login: catalog.user, relayed: false }, id, delivery),
			);
		},
	},
	log,
});

const clients = new Set<Socket>();
let quiet = Date.now();
let exiting = false;

async function exit(kill: boolean, reason: string) {
	if (exiting) return;
	exiting = true;
	log("info", "worker.exit", { reason, kill, clients: clients.size });
	if (kill) await channel.kill();
	await channel.close();
	catalog.busy(id, false);
	for (const env of envs.values()) await env.cleanup(BACKGROUND_CONTEXT);
	// Keep the exiting guard reachable until cleanup finishes; a missing listener looks dormant.
	server.close();
	rmSync(paths.socket, { force: true });
	rmSync(paths.pid, { force: true });
	// A closed connection tells the host that durable storage and tool cleanup have finished.
	for (const client of clients) client.destroy();
	process.exit(0);
}

function serve(socket: Socket) {
	clients.add(socket);
	log("debug", "client.open", { clients: clients.size });
	const watches: { stop(): Promise<unknown> }[] = [];
	const send = (frame: Frame) => socket.writable && socket.write(`${JSON.stringify(frame)}\n`);
	socket.on("error", (error) => {
		log("warn", "client.error", { error: error.message });
		socket.destroy();
	});
	socket.on("close", () => {
		clients.delete(socket);
		quiet = Date.now();
		for (const watch of watches) watch.stop();
	});
	lines(socket, async (line) => {
		const { id: frame, trace, ...body } = JSON.parse(line) as
			| Envelope
			| ({ id: number; trace?: string } & WorkerRequest);
		try {
			if (body.op === "worker") {
				return send({ id: frame, ok: true, value: { id, pid: process.pid } satisfies WorkerInfo });
			}
			if (exiting) throw new Error("The channel worker is shutting down");
			if (
				catalog.read(id).archived && (body.op === "say" || body.op === "ask" || body.op === "chat")
			) {
				throw new Error("The channel is archived");
			}
			const value = await channel.handle(body, (event) => send({ id: frame, event }), trace);
			if (body.op === "watch") {
				watches.push(value as { stop(): Promise<unknown> });
				return send({ id: frame, ok: true, value: null });
			}
			send({ id: frame, ok: true, value: value ?? null });
			if (body.op === "kill") exit(false, "kill");
		} catch (error) {
			send({ id: frame, ok: false, error: error instanceof Error ? error.message : String(error) });
		}
	});
}

const server = createServer(serve);
server.listen(paths.socket);

// Dormant channels are files, not processes: retire once nobody is attached and no work is live.
setInterval(async () => {
	if (clients.size > 0 || exiting) return;
	if (!(await channel.isIdle())) return void (quiet = Date.now());
	if (Date.now() - quiet > RETIRE_AFTER) exit(false, "idle");
}, 30_000);

// A signal closes without aborting, so a restarted worker resumes the work.
process.on("SIGTERM", () => exit(false, "SIGTERM"));
process.on("SIGINT", () => exit(false, "SIGINT"));
