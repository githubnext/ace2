/** The host gateway's wire contract: JSON messages over one WebSocket per client. */
import type { ChannelInfo, Event, ModelRef, Request } from "@ace/channel/protocol";

export const HOST_PROTOCOL = 2;

export type HostInfo = {
	app: "ace";
	protocol: number;
	home: string;
	pid: number;
};

/** `offline`: the channel's host is unreachable. Hosted channels are never offline. */
export type ChannelState = "running" | "dormant" | "archived" | "offline";

export type Listing = {
	id: string;
	/** The machine running the channel, by its tailnet name. */
	host: string;
	name: string;
	owner: string;
	project: string;
	model: ModelRef;
	created: number;
	state: ChannelState;
	/** The hosting service's base URL, for a hosted channel; `host` is then its workspace. */
	hosted?: string;
};

export type Hello = { user: string; host: string };

export type ProviderId = "anthropic" | "openai";

export type CredentialStatus = {
	source: "keychain" | "environment" | "missing" | "unavailable";
	stored: boolean | null;
	override?: string;
	error?: string;
};

export type ProviderSettings = CredentialStatus & { id: ProviderId; name: string };

export type Settings = {
	providers: ProviderSettings[];
	model: ModelRef | null;
	modelOverride?: ModelRef;
	models: ModelRef[];
	error?: string;
};

export type HostRequest =
	| { op: "hello" }
	| { op: "channels" }
	/** These settings belong to the local owner and are never forwarded to peers. */
	| { op: "settings" }
	| { op: "key-set"; provider: ProviderId; value: string }
	| { op: "key-check"; provider: ProviderId }
	| { op: "key-remove"; provider: ProviderId }
	| { op: "preferences"; model: ModelRef | null }
	/** Models with credentials on a host; this host when omitted. */
	| { op: "models"; host?: string }
	/** Owner actions; tailnet peers create, archive, and delete channels on their own hosts. */
	| { op: "create"; project: string; name?: string; model?: ModelRef }
	| { op: "archive"; channel: string; archived: boolean }
	| { op: "delete"; channel: string }
	/**
	 * Forward a request to a channel on this host or a peer, starting its worker if dormant. The
	 * channel's host sets every author field to the participant it verified. A `watch` streams
	 * events until `release`.
	 */
	| { op: "channel"; channel: string; request: Request }
	/** Drop this client's connection to a channel, ending its watches. */
	| { op: "release"; channel: string };

/** `trace` follows a request through every host and worker that relays it. */
export type HostEnvelope = { id: number; trace?: string } & HostRequest;

export type HostFrame =
	| { id: number; ok: true; value: unknown }
	| { id: number; ok: false; error: string }
	| { id: number; event: Event }
	/** Local settings changed; clients reload model availability without receiving secrets. */
	| { settings: true }
	/**
	 * Pushed when any reachable host's catalog changes. A local client sees every reachable host's
	 * channels; a tailnet peer sees only this host's.
	 */
	| { channels: Listing[] };

export type { ChannelInfo, Event, ModelRef, Request };
