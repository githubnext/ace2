import { closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createServer, type Socket } from "node:net";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

import { Channel, type Envelope, type Frame } from "@ace/channel";

import * as catalog from "./catalog";
import { request } from "./client";
import { models } from "./keys";
import { lines } from "./lines";

const RETIRE_AFTER = 10 * 60_000;

const id = process.argv[2];
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

if (!lock()) process.exit(0);
rmSync(paths.socket, { force: true });

const envs = new Map<string, NodeExecutionEnv>();
const channel = await Channel.open({
	id,
	name: record.name,
	owner: record.owner,
	project: record.project,
	lanes: paths.lanes,
	model: record.model,
	storage: await openNodeSqliteStorage(paths.storage),
	models: models(),
	env(cwd) {
		let env = envs.get(cwd);
		if (!env) envs.set(cwd, env = new NodeExecutionEnv({ cwd }));
		return env;
	},
	directory: {
		self: { id, name: record.name },
		list: async () => catalog.list().filter((other) => other.id !== id && !other.archived),
		async deliver(delivery) {
			const op = delivery.invoke ? "ask" : "say";
			const { channel: target, chat, author, text, requestId } = delivery;
			await request(target, {
				op,
				...(chat === undefined ? {} : { chat }),
				author,
				text,
				requestId,
			});
		},
	},
	report: (error) => console.error(new Date().toISOString(), error),
});

const clients = new Set<Socket>();
let quiet = Date.now();
let exiting = false;

async function exit(kill: boolean) {
	if (exiting) return;
	exiting = true;
	if (kill) await channel.kill();
	server.close();
	for (const client of clients) client.destroy();
	await channel.close();
	for (const env of envs.values()) await env.cleanup(BACKGROUND_CONTEXT);
	rmSync(paths.socket, { force: true });
	rmSync(paths.pid, { force: true });
	process.exit(0);
}

function serve(socket: Socket) {
	clients.add(socket);
	const watches: { stop(): Promise<unknown> }[] = [];
	const send = (frame: Frame) => socket.writable && socket.write(`${JSON.stringify(frame)}\n`);
	socket.on("error", () => socket.destroy());
	socket.on("close", () => {
		clients.delete(socket);
		quiet = Date.now();
		for (const watch of watches) watch.stop();
	});
	lines(socket, async (line) => {
		const { id: frame, ...body } = JSON.parse(line) as Envelope;
		try {
			if (
				catalog.read(id).archived && (body.op === "say" || body.op === "ask" || body.op === "chat")
			) {
				throw new Error("The channel is archived");
			}
			const value = await channel.handle(body, (event) => send({ id: frame, event }));
			if (body.op === "watch") {
				watches.push(value as { stop(): Promise<unknown> });
				return send({ id: frame, ok: true, value: null });
			}
			send({ id: frame, ok: true, value: value ?? null });
			if (body.op === "kill") exit(false);
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
	if (Date.now() - quiet > RETIRE_AFTER) exit(false);
}, 30_000);

// A signal closes without aborting, so a restarted worker resumes the work.
process.on("SIGTERM", () => exit(false));
process.on("SIGINT", () => exit(false));
