import type { Models } from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
	AgentDoc,
	type AgentEvent,
	type Conversation,
	type ConversationId,
	type ConversationRecord,
	createRegistry,
	type Cursor,
	defineDoc,
	defineExtension,
	type EntryRecord,
	Harness,
	LiveDoc,
	ROOT_CONVERSATION_ID,
	type Storage,
	type SubmissionId,
	watchEvents,
} from "@earendil-works/pi-durable";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import { CodingTools } from "@earendil-works/pi-durable/tools";

import { type Directory, messaging, Subagent } from "./agents";
import { lanes, LanesDoc } from "./lanes";
import type { ChannelInfo, Chat, ChatId, Event, ModelRef, Request } from "./protocol";
import * as room from "./room";

const SettingsDoc = defineDoc<{ shared: boolean }>({
	kind: "ace.settings",
	version: 1,
	scope: "session",
	initial: () => ({ shared: true }),
});

export type Options = {
	id: string;
	name: string;
	owner: string;
	/** Paths inside the execution environment's file system. */
	project: string;
	lanes: string;
	model: ModelRef;
	storage: Storage;
	models: Models;
	env(cwd: string): ExecutionEnv;
	directory: Directory;
	report(error: unknown): void;
};

type Send = (event: Event) => void;

export class Channel {
	#options: Options;
	#harness: Harness;

	private constructor(options: Options, harness: Harness) {
		this.#options = options;
		this.#harness = harness;
	}

	static async open(options: Options): Promise<Channel> {
		const registry = createRegistry();
		registry.install(CodingTools);
		registry.install(lanes(options));
		registry.install(Subagent);
		registry.install(messaging(options.directory));
		registry.install(defineExtension({ name: "ace-channel", sections: [room.section(options)] }));
		const harness = await Harness.open(options.storage, {
			models: options.models,
			registry,
			env: ({ cwd }) => options.env(cwd || options.project),
			onReport: options.report,
		}, context);
		await harness.root(context, { agent: { model: options.model, cwd: options.project } });
		// Opening resumes work a crash interrupted; a killed channel left only terminal tasks behind.
		harness.resume();
		return new Channel(options, harness);
	}

	async handle(request: Request, send: Send): Promise<unknown> {
		switch (request.op) {
			case "info":
				return this.info();
			case "models":
				return (await this.#options.models.getAvailable()).map(({ provider, id }) => ({
					provider,
					modelId: id,
				}));
			case "say":
				return this.#say(request);
			case "ask":
				return this.#ask(request);
			case "chat":
				return this.#chat(request);
			case "stop":
				return (await this.#conversation(request.chat)).abort(context);
			case "kill":
				return this.kill();
			case "share":
				return this.#share(request);
			case "watch":
				return this.#watch(request.chat, send);
			case "wait": {
				const submission = await this.#harness.submission(
					request.submission as SubmissionId,
					context,
				);
				if (!submission) throw new Error(`Unknown submission ${request.submission}`);
				return (await submission.wait(context)).status;
			}
		}
	}

	async info(): Promise<ChannelInfo> {
		const { id, name, project, owner } = this.#options;
		const settings = await this.#harness.snapshot(SettingsDoc, context);
		const records: ConversationRecord[] = [];
		let cursor: Cursor | undefined;
		do {
			const page = await this.#harness.commit(
				(tx) => tx.scanConversations({}, 256, cursor),
				context,
			);
			records.push(...page.items);
			cursor = page.next;
		} while (cursor);
		const lanes = (await this.#harness.snapshot(LanesDoc, context))?.lanes || {};
		const byPath = new Map(Object.entries(lanes).map(([lane, { path }]) => [path, lane]));
		const chats: Chat[] = await Promise.all(records.map(async (record) => {
			const agent = await this.#harness.snapshot(AgentDoc, record.id, context);
			const live = await this.#harness.snapshot(LiveDoc, record.id, context);
			const lane = agent?.cwd && byPath.get(agent.cwd);
			const chat: Chat = { id: record.id, busy: !!live?.run };
			if (record.owner) chat.parent = record.owner.conversationId;
			if (agent?.model) chat.model = agent.model;
			if (lane) chat.lane = lane;
			return chat;
		}));
		return { id, name, project, owner, shared: settings?.shared ?? true, chats };
	}

	async isIdle(): Promise<boolean> {
		return (await this.info()).chats.every((chat) => !chat.busy);
	}

	/** Durably abort every chat's work, including background subagents, so reopening resumes none of it. */
	async kill(): Promise<void> {
		const { chats } = await this.info();
		await Promise.all(chats.map(async (chat) => {
			const conversation = await this.#harness.conversation(chat.id as ConversationId, context);
			await conversation?.abort(context, { background: true });
		}));
	}

	close(): Promise<void> {
		return this.#harness.close(context);
	}

	async #conversation(chat: ChatId | undefined): Promise<Conversation> {
		const conversation = await this.#harness.conversation(
			(chat ?? ROOT_CONVERSATION_ID) as ConversationId,
			context,
		);
		if (!conversation) throw new Error(`No chat ${chat}`);
		return conversation;
	}

	#author(author: string) {
		if (!room.isAuthor(author)) throw new Error(`Invalid author ${author}`);
	}

	async #say(request: Extract<Request, { op: "say" }>) {
		this.#author(request.author);
		const conversation = await this.#conversation(request.chat);
		const entry = room.draft(request.author, request.text, Date.now());
		const submission = await conversation.submit({
			type: "write",
			entry,
			...(request.requestId ? { requestId: request.requestId } : {}),
		}, context);
		return { submission: submission.id };
	}

	async #ask(request: Extract<Request, { op: "ask" }>) {
		this.#author(request.author);
		const settings = await this.#harness.snapshot(SettingsDoc, context);
		const isOwner = request.author === this.#options.owner;
		if (!isOwner && settings?.shared === false) {
			throw new Error("Only the owner can invoke agents here");
		}
		const conversation = await this.#conversation(request.chat);
		if (request.model) await this.#select(conversation, request.model);
		const submission = await conversation.submit({
			type: "input",
			content: room.content(request.author, request.text),
			whenBusy: "steer",
			...(request.requestId ? { requestId: request.requestId } : {}),
		}, context);
		return { submission: submission.id };
	}

	/** A model applies to a whole run, so it cannot change while one is active. */
	async #select(conversation: Conversation, model: ModelRef) {
		const current = (await conversation.agent(context)).model;
		if (current?.provider === model.provider && current.modelId === model.modelId) return;
		if (!this.#options.models.getModel(model.provider, model.modelId)) {
			throw new Error(`Unknown model ${model.provider}/${model.modelId}`);
		}
		const live = await this.#harness.snapshot(LiveDoc, conversation.id, context);
		if (live?.run) throw new Error("The chat is busy; stop it or wait before changing its model");
		await conversation.configure({ model }, context);
	}

	async #chat(request: Extract<Request, { op: "chat" }>) {
		this.#author(request.author);
		const conversation = await this.#harness.createConversation({
			ownership: { kind: "ownerless" },
			agent: { model: request.model || this.#options.model, cwd: this.#options.project },
		}, context);
		return { chat: conversation.id };
	}

	async #share(request: Extract<Request, { op: "share" }>) {
		if (request.author !== this.#options.owner) {
			throw new Error("Only the owner can change sharing");
		}
		await this.#harness.commit(async (tx) => {
			(await tx.doc(SettingsDoc)).shared = request.shared;
		}, context);
	}

	/** Replays the chat's active transcript, then streams. Resolves when the stream ends. */
	async #watch(chat: ChatId | undefined, send: Send) {
		const conversation = await this.#conversation(chat);
		const stream = await watchEvents(this.#harness, conversation.id, context);
		for (const entry of stream.snapshot.entries) for (const event of events(entry)) send(event);
		send({ kind: "live", chat: conversation.id });
		stream.start(async (batch) => {
			for (const event of batch) for (const mapped of live(conversation.id, event)) send(mapped);
		});
		return stream;
	}
}

function live(chat: ChatId, event: AgentEvent): Event[] {
	if (event.type === "message_end") return events(event.entry);
	if (event.type === "message_update") {
		const text = event.changes.flatMap((change) =>
			change.type === "text_delta" ? [change.delta] : []
		).join("");
		return text ? [{ kind: "delta", chat, text }] : [];
	}
	if (event.type === "run_start") return [{ kind: "run", chat, state: "start" }];
	if (event.type === "run_end") return [{ kind: "run", chat, state: "end" }];
	return [];
}

function events(entry: EntryRecord): Event[] {
	const chat = entry.conversationId;
	const human = room.human(entry);
	if (human) return [{ kind: "message", chat, entry: entry.id, ...human }];
	const message = entry.model?.[0];
	if (message?.role === "assistant") {
		const out: Event[] = [];
		const text = room.text(message);
		const at = message.timestamp;
		if (text) out.push({ kind: "reply", chat, entry: entry.id, at, model: message.model, text });
		for (const block of message.content) {
			if (block.type !== "toolCall") continue;
			out.push({ kind: "tool", chat, at, call: block.id, name: block.name, args: block.arguments });
		}
		return out;
	}
	if (message?.role === "toolResult") {
		return [{
			kind: "result",
			chat,
			call: message.toolCallId,
			error: message.isError,
			text: room.text(message),
		}];
	}
	return [];
}
