/** The host gateway's wire contract: JSON messages over one WebSocket per client. */
import type { ChannelInfo, Event, ModelRef, Request } from "@ace/channel/protocol";

export type ChannelState = "running" | "dormant" | "archived";

export type Listing = {
	id: string;
	name: string;
	owner: string;
	project: string;
	model: ModelRef;
	created: number;
	state: ChannelState;
};

export type Hello = { user: string; host: string };

export type HostRequest =
	| { op: "hello" }
	| { op: "channels" }
	| { op: "models" }
	| { op: "create"; project: string; name?: string; model?: ModelRef }
	| { op: "archive"; channel: string; archived: boolean }
	| { op: "delete"; channel: string }
	/**
	 * Forward a request to a channel, starting its worker if dormant. The gateway sets every author
	 * field to the connected participant. A `watch` streams events until `release`.
	 */
	| { op: "channel"; channel: string; request: Request }
	/** Drop this client's connection to a channel, ending its watches. */
	| { op: "release"; channel: string };

export type HostEnvelope = { id: number } & HostRequest;

export type HostFrame =
	| { id: number; ok: true; value: unknown }
	| { id: number; ok: false; error: string }
	| { id: number; event: Event }
	/** Pushed when the catalog changes: a channel was created, archived, deleted, or started. */
	| { channels: Listing[] };

export type { ChannelInfo, Event, ModelRef, Request };
