import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";

import { type Call, serve } from "@ace/channel/workspace";

import * as catalog from "./catalog";
import { hostedSocket } from "./client";

/**
 * A hosted channel's tools run here. The host dials out, so it needs no inbound route; while it
 * is disconnected the channel stays reachable and its tools report the workspace as offline.
 */
function link(record: catalog.Listing): () => void {
	const envs = new Map<string, NodeExecutionEnv>();
	const env = (cwd: string) => {
		let found = envs.get(cwd);
		if (!found) envs.set(cwd, found = new NodeExecutionEnv({ cwd }));
		return found;
	};
	let stopped = false;
	let socket: WebSocket | undefined;
	let wait = 1000;
	const connect = async () => {
		if (stopped) return;
		try {
			socket = await hostedSocket(record.hosted!, `/channels/${record.id}/workspace`);
			wait = 1000;
			const handle = serve(env, (reply) => socket?.send(JSON.stringify(reply)));
			socket.addEventListener("message", ({ data }) => handle(JSON.parse(String(data)) as Call));
			socket.addEventListener("close", () => {
				socket = undefined;
				setTimeout(connect, wait);
			});
		} catch (error) {
			console.error(`Workspace for ${record.name}: ${(error as Error).message}`);
			wait = Math.min(wait * 2, 30_000);
			setTimeout(connect, wait);
		}
	};
	connect();
	return () => {
		stopped = true;
		socket?.close();
		for (const found of envs.values()) found.cleanup(BACKGROUND_CONTEXT);
	};
}

const links = new Map<string, () => void>();

/** Serve the workspace of every hosted channel in this host's catalog. */
export function sync(): void {
	const wanted = new Map(
		catalog.list().filter((record) => record.hosted && !record.archived).map((r) => [r.id, r]),
	);
	for (const [id, stop] of links) {
		if (!wanted.has(id)) {
			stop();
			links.delete(id);
		}
	}
	for (const [id, record] of wanted) if (!links.has(id)) links.set(id, link(record));
}
