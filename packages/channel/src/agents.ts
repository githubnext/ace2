import type { Context } from "@earendil-works/chord";
import { type AssistantMessage, Type } from "@earendil-works/pi-ai";
import {
	AssistantEntry,
	configure,
	defineExtension,
	defineTool,
	type EntryId,
	type Extension,
	type ToolExecutionApi,
} from "@earendil-works/pi-durable";

import type { Delivery } from "./protocol";
import { MetadataExtension } from "./metadata";
import * as room from "./room";

async function answer(api: ToolExecutionApi, id: EntryId, context: Context): Promise<string> {
	const entry = await api.commit((tx) => tx.entry(AssistantEntry, id), context);
	const message = entry?.model?.[0] as AssistantMessage | undefined;
	return message ? room.text(message) : "";
}

function model(value: string | undefined) {
	if (!value) return;
	const split = value.indexOf("/");
	if (split < 1) {
		throw new Error("A model is written provider/model-id, such as openai/gpt-6-astra");
	}
	return { provider: value.slice(0, split), modelId: value.slice(split + 1) };
}

/**
 * A subagent works in a child chat owned by this tool call's task, so stopping or killing the parent
 * reaches the child. The child stays in the channel afterwards for people to read or continue.
 */
export const Subagent: Extension = defineExtension({
	name: "ace-subagent",
	tools: [
		defineTool({
			name: "subagent",
			description:
				"Delegate a self-contained piece of work to a subagent in a new chat of this channel and wait for its answer. It does not see this chat, so give it everything it needs. It starts in your current lane; tell it to start its own lane for separate work.",
			parameters: Type.Object({
				task: Type.String({ description: "What the subagent should do" }),
				model: Type.Optional(
					Type.String({ description: "provider/model-id; defaults to your model" }),
				),
			}),
			// A rerun after a crash finds the child it created and the submission it made.
			replay: "safe",
			execute: async (args, api, context) => {
				const change = model(args.model);
				const child = await api.commit(async (tx) => {
					const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
					if (existing) return existing.id;
					const created = await tx.createConversation({
						ownership: { kind: "task", taskId: api.taskId },
					});
					await configure(tx, created.id, {
						extensions: { remove: [Subagent, MetadataExtension] },
						...(change ? { model: change } : {}),
					});
					return created.id;
				}, context);
				await api.details({ chat: child }, context);
				const handle = (await api.conversation(child, context))!;
				const author = `agent@${api.conversationId}`;
				const request = {
					type: "input",
					content: room.content(author, args.task),
					requestId: `subagent:${api.taskId}`,
				} as const;
				const settled = await (await handle.submit(request, context)).wait(context);
				if (settled.status !== "done" || settled.type !== "input") {
					throw new Error(`Subagent chat ${child} ended ${settled.status}`);
				}
				const text = await answer(api, settled.answer, context);
				return { content: [{ type: "text", text }], details: { chat: child } };
			},
		}),
	],
});

/** A channel an agent can message, with the context needed to tell repeated names apart. */
export type Destination = {
	id: string;
	name: string;
	project: string;
	/** The project's GitHub repository as owner/name. */
	repo?: string;
	/** The machine running the channel, by its tailnet name. */
	host?: string;
	owner?: string;
	state?: string;
	summary?: string;
};

export type Directory = {
	self: { id: string };
	/** `note` explains a narrower reach, such as peer hosts being unreachable without a host. */
	list(context: Context): Promise<{ channels: Destination[]; note?: string }>;
	/** The destination's host authors the message from `self` and the sender it verified. */
	deliver(delivery: Delivery, context: Context): Promise<void>;
};

function describe(channel: Destination): string {
	return [
		channel.id,
		channel.name,
		channel.host || "",
		channel.owner || "",
		channel.state || "",
		channel.repo || channel.project,
	].join("\t");
}

/** Agents in different channels coordinate only by messaging each other's chats. */
export function messaging(directory: Directory): Extension {
	return defineExtension({
		name: "ace-messaging",
		tools: [
			defineTool({
				name: "channels",
				description:
					"List the channels you can message on this host and reachable peer hosts, with their ids, hosts, owners, states, projects, and rolling summaries. Names can repeat; message by id.",
				parameters: Type.Object({}),
				replay: "safe",
				execute: async (_args, _api, context) => {
					const { channels, note } = await directory.list(context);
					const lines = channels.map((channel) =>
						describe(channel)
						+ (channel.summary ? `\t${channel.summary.replace(/\s+/g, " ")}` : "")
					);
					const text = lines.length
						? ["id\tname\thost\towner\tstate\tproject\tsummary", ...lines].join("\n")
						: "No other channels.";
					return { content: [{ type: "text", text: note ? `${text}\n\n${note}` : text }] };
				},
			}),
			defineTool({
				name: "message",
				description:
					"Post a message to another channel's chat, on this host or a reachable peer host. Set invoke to start that chat's agent on it; otherwise people and the agent there only see it. Delivery does not wait for an answer. Your message is authored agent.<this channel's id>@<your host's login>; answer such a message by messaging that channel id.",
				parameters: Type.Object({
					channel: Type.String({
						description: "Channel id or unique name; use the id when names repeat",
					}),
					chat: Type.Optional(
						Type.Number({ description: "Chat id; defaults to the channel's first chat" }),
					),
					text: Type.String(),
					invoke: Type.Boolean(),
				}),
				// The request ID makes redelivery after a crash a no-op at the destination.
				replay: "safe",
				execute: async (args, api, context) => {
					// Names can change after delivery; a recovered call must keep its original destination.
					const saved = await api.memo<string>("channel", context);
					let target = saved;
					let name = saved && `channel ${saved}`;
					if (!target) {
						const { channels } = await directory.list(context);
						let found = channels.find((channel) => channel.id === args.channel);
						if (!found) {
							const matches = channels.filter((channel) => channel.name === args.channel);
							if (matches.length > 1) {
								throw new Error(
									`More than one channel is named ${args.channel}; use one of these ids:\n`
										+ matches.map(describe).join("\n"),
								);
							}
							found = matches[0];
						}
						if (!found) throw new Error(`No channel ${args.channel}; list channels to find its id`);
						target = found.id;
						name = found.host ? `${found.name} on ${found.host}` : found.name;
						await api.memo("channel", target, context);
					}
					await directory.deliver({
						channel: target,
						...(args.chat === undefined ? {} : { chat: args.chat }),
						text: args.text,
						invoke: args.invoke,
						requestId: `message:${directory.self.id}:${api.taskId}`,
					}, context);
					return { content: [{ type: "text", text: `Delivered to ${name}` }] };
				},
			}),
		],
	});
}
