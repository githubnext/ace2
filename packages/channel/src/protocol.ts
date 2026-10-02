/** The wire contract between a channel and its clients: one JSON value per line. */

export type ModelRef = { provider: string; modelId: string };

/** pi conversation and entry IDs. */
export type ChatId = number;
export type EntryId = number;

export type ChannelInfo = {
	id: string;
	name: string;
	/** Directory of the project checkout lanes are created from. */
	project: string;
	owner: string;
	/** Whether participants other than the owner may invoke agents. */
	shared: boolean;
	chats: Chat[];
};

export type Chat = {
	id: ChatId;
	/** The chat whose agent created this one as a subagent. */
	parent?: ChatId;
	busy: boolean;
	model?: ModelRef;
	lane?: string;
};

/** A file the chat's work changed, relative to `Changes.cwd`. */
export type Change = { file: string; from?: string; binary: boolean; adds: number; dels: number };

/**
 * What a chat's work changed: its lane's commits since it branched from the project's HEAD, plus
 * uncommitted and untracked files. A chat without a lane shows the checkout against HEAD.
 */
export type Changes = { lane?: string; cwd: string; base: string; head: string; files: Change[] };

export type Request =
	| { op: "info" }
	| { op: "models" }
	/** Post to the chat without invoking its agent. */
	| { op: "say"; chat?: ChatId; author: string; text: string; requestId?: string }
	/** Post to the chat and invoke its agent; a busy chat takes the message as steering. */
	| { op: "ask"; chat?: ChatId; author: string; text: string; model?: ModelRef; requestId?: string }
	| { op: "chat"; author: string; model?: ModelRef }
	| { op: "stop"; chat?: ChatId }
	| { op: "kill" }
	| { op: "share"; author: string; shared: boolean }
	/** Resolve once the answer to a submission is placed: "done", or "unanswered" when stopped or killed. */
	| { op: "wait"; submission: number }
	| { op: "changes"; chat?: ChatId }
	/** One file's unified diff, against the same base as `changes`. */
	| { op: "patch"; chat?: ChatId; file: string }
	/** Replay the chat's transcript, then stream its events until the connection closes. */
	| { op: "watch"; chat?: ChatId };

export type Event =
	/** A human message; `invoked` when it asked the chat's agent to run. */
	| {
		kind: "message";
		chat: ChatId;
		entry: EntryId;
		at: number;
		author: string;
		text: string;
		invoked: boolean;
	}
	/** `error` when the provider failed the response; `stopped` when someone stopped it. */
	| {
		kind: "reply";
		chat: ChatId;
		entry: EntryId;
		at: number;
		model: string;
		text: string;
		error?: string;
		stopped?: boolean;
	}
	/** Streamed text of the reply being generated; the next `reply` replaces it. */
	| { kind: "delta"; chat: ChatId; text: string }
	| {
		kind: "tool";
		chat: ChatId;
		at: number;
		model: string;
		call: string;
		name: string;
		args: unknown;
	}
	| { kind: "result"; chat: ChatId; call: string; error: boolean; text: string }
	| { kind: "run"; chat: ChatId; state: "start" | "end" }
	/** The replayed transcript has been sent; later events are live. */
	| { kind: "live"; chat: ChatId };

export type Frame =
	| { id: number; ok: true; value: unknown }
	| { id: number; ok: false; error: string }
	| { id: number; event: Event };

/** `trace` ties a request's log lines together across the processes that relay it. */
export type Envelope = { id: number; trace?: string } & Request;

/** A message one channel's agent sends to another channel. */
export type Delivery = {
	channel: string;
	chat?: ChatId;
	author: string;
	text: string;
	invoke: boolean;
	requestId: string;
};
