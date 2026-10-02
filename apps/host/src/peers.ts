/** Other hosts on the tailnet: found through Tailscale, reached on their gateway's tailnet listener. */
import { isIP } from "node:net";

import { GatewayClient } from "./gateway-client";
import { log } from "./log";
import type { Listing } from "./protocol";
import { type Machine, peers } from "./tailnet";

/** Hosts serve their tailnet listener on the same port unless told otherwise. */
const port = () => Number(process.env.ACE_PEER_PORT || process.env.ACE_PORT || 4140);

export function url(machine: Machine): string {
	const address = isIP(machine.address) === 6 ? `[${machine.address}]` : machine.address;
	return `ws://${address}:${port()}/ws`;
}

/** One listing connection per online peer, kept only while the peer answers. */
const hosts = new Map<string, { machine: Machine; client: GatewayClient }>();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

async function discover() {
	const online = new Map((await peers()).map((machine) => [machine.name, machine]));
	for (const [name, host] of hosts) {
		if (online.get(name)?.address === host.machine.address) continue;
		host.client.close();
		hosts.delete(name);
		log("info", "peer.gone", { peer: name });
		emit();
	}
	for (const [name, machine] of online) {
		if (hosts.has(name)) continue;
		const client = new GatewayClient(url(machine));
		let status = client.status;
		client.subscribe(() => {
			if (client.status !== status) {
				log(client.status === "open" ? "info" : "debug", "peer.status", {
					peer: name,
					address: machine.address,
					from: status,
					to: client.status,
				});
				status = client.status;
			}
			emit();
		});
		hosts.set(name, { machine, client });
	}
}

/** Start looking for peers; `onChange` runs when any peer's channels or reachability change. */
export function watch(onChange: () => void) {
	listeners.add(onChange);
	void discover();
	setInterval(() => void discover(), 15_000);
}

/** Every reachable peer's channels. */
export function listings(): Listing[] {
	return [...hosts.values()].flatMap(({ client }) =>
		client.status === "open" ? client.channels : []
	);
}

/** The peer that runs a channel, if it is reachable. */
export function find(channel: string): Machine | undefined {
	for (const { machine, client } of hosts.values()) {
		if (client.status === "open" && client.channels.some((value) => value.id === channel)) {
			return machine;
		}
	}
}

export function machine(name: string): Machine | undefined {
	return hosts.get(name)?.machine;
}
