/** The host gateway's wire contract: JSON messages over one WebSocket per client. */
import type {
	ChannelInfo,
	Event,
	GithubFilter,
	GithubKind,
	ModelRef,
	Request,
} from "@ace/channel/protocol";

export const HOST_PROTOCOL = 8;

export type HostInfo = {
	app: "ace";
	protocol: number;
	home: string;
	pid: number;
	helper: boolean;
};

export type WorkerInfo = { id: string; pid: number };
export type WorkerRequest = { op: "worker" };

export type Diagnostics = {
	tools: { name: string; path?: string; version?: string; error?: string }[];
	tailscale: {
		state: "missing" | "offline" | "running" | "error";
		name?: string;
		error?: string;
	};
	directory: { url?: string; synced?: number; error?: string };
};

/** `offline`: the channel's host is unreachable. Hosted channels are never offline. */
export type ChannelState = "running" | "dormant" | "archived" | "offline";

export type Listing = {
	id: string;
	/** The machine running the channel, by its tailnet name. */
	host: string;
	name: string;
	summary?: string;
	/** Revision of the channel's projected name and summary. */
	revision?: number;
	owner: string;
	project: string;
	model?: ModelRef;
	created: number;
	state: ChannelState;
	/** The hosting service's base URL, for a hosted channel; `host` is then its workspace. */
	hosted?: string;
};

export type Hello = { user: string; host: string };

/** Tabs belong to a connected client's layout, not the durable channel. */
export type Tab = {
	id: string;
	name: string;
	type: "blank" | "chat" | "diff" | "terminal";
	/** Selected in its pane; split layouts can show several active tabs. */
	active: boolean;
};

export type WindowState = { channel: { id: string; name: string }; tabs: Tab[] };
export type WindowInfo = WindowState & { id: string };
export type TabRename = {
	call: string;
	channel: string;
	tab: string;
	name: string;
	expires: number;
};
export type TabResult = { ok: true; value: WindowState } | { ok: false; error: string };

/** A folder opened on this host, independent of its channels and provider setup. */
export type Project = { path: string; name: string };

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
	/** Publish this local client's current channel layout, or unregister it. */
	| { op: "window"; value: WindowState | null }
	/** Connected channel windows on the owner's local gateway. */
	| { op: "windows" }
	| { op: "tab-rename"; window: string; channel: string; tab: string; name: string }
	/** Only the window that received a rename can acknowledge it. */
	| { op: "tab-result"; call: string; result: TabResult }
	| { op: "channels" }
	| { op: "projects" }
	| { op: "project-open"; path: string }
	/** Resolve a known project's GitHub remote on the machine that holds its checkout. */
	| { op: "project-repo"; project: string; host?: string }
	/** GitHub reads use the local owner's GitHub CLI credentials, never a peer's account. */
	| {
		op: "github-list";
		repo: string;
		kind: GithubKind;
		state: GithubFilter;
		search: string;
		limit: number;
	}
	| { op: "github-detail"; repo: string; kind: GithubKind; number: number }
	| { op: "github-files"; repo: string; number: number }
	/** These settings belong to the local owner and are never forwarded to peers. */
	| { op: "settings" }
	| { op: "diagnostics" }
	| { op: "key-set"; provider: ProviderId; value: string }
	| { op: "key-check"; provider: ProviderId }
	| { op: "key-remove"; provider: ProviderId }
	| { op: "preferences"; model: ModelRef | null }
	/** Quiesce this helper before replacing its application, or recover a canceled update. */
	| { op: "update-prepare" }
	| { op: "update-cancel" }
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
	/**
	 * Open a terminal in a chat's working directory, or reattach to `terminal` and replay its recent
	 * output. Only for channels whose workspace is this host. Output arrives as terminal frames; a
	 * terminal outlives its clients until closed, its shell exits, or it sits unattached too long.
	 */
	| {
		op: "terminal";
		channel: string;
		chat?: number;
		terminal?: string;
		cols: number;
		rows: number;
	}
	/** Keystrokes and pasted text, as UTF-8. */
	| { op: "terminal-input"; terminal: string; data: string }
	| { op: "terminal-resize"; terminal: string; cols: number; rows: number }
	| { op: "terminal-close"; terminal: string }
	/** Drop this client's connection to a channel, ending its watches. */
	| { op: "release"; channel: string };

/** `trace` follows a request through every host and worker that relays it. */
export type HostEnvelope = { id: number; trace?: string } & HostRequest;

export type HostFrame =
	| { id: number; ok: true; value: unknown }
	| { id: number; ok: false; error: string }
	| { id: number; event: Event }
	| { rename: TabRename }
	/** Local settings changed; clients reload model availability without receiving secrets. */
	| { settings: true }
	/** Opened projects belong to the local owner and are never sent to tailnet peers. */
	| { projects: Project[] }
	/**
	 * Pushed when any reachable host's catalog changes. A local client sees every reachable host's
	 * channels; a tailnet peer sees only this host's.
	 */
	| { channels: Listing[] }
	| TerminalFrame;

/**
 * Terminal output as base64, since a chunk can split a UTF-8 sequence; then its exit code. A
 * reattach starts with one `replay` frame of earlier output, whose queries must not be answered.
 */
export type TerminalFrame =
	| { terminal: string; data: string; replay?: true }
	| { terminal: string; exit: number };

export type TerminalOpened = { terminal: string; cwd: string };

export type { ChannelInfo, Event, ModelRef, Request };
