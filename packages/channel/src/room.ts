import type { Message, UserMessage } from "@earendil-works/pi-ai";
import {
	defineEntry,
	type EntryRecord,
	type JsonObject,
	type PromptSection,
} from "@earendil-works/pi-durable";

/** A human message that did not invoke an agent. */
export const MessageEntry = defineEntry<{ author: string; text: string }>("ace.message");

const AUTHOR = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

export function isAuthor(value: string): boolean {
	return AUTHOR.test(value);
}

/**
 * Agents see every participant's messages as `author: text`. Invocations are pi inputs, which carry
 * only content, so the author prefix is also how an input's author is recovered.
 */
export function content(author: string, text: string): string {
	return `${author}: ${text}`;
}

export function message(author: string, text: string, timestamp: number): UserMessage {
	return { role: "user", content: content(author, text), timestamp };
}

export function draft(author: string, text: string, timestamp: number) {
	return {
		kind: MessageEntry.kind,
		data: { author, text } satisfies JsonObject,
		model: [message(author, text, timestamp)],
	};
}

export function text(message: Message): string {
	if (typeof message.content === "string") return message.content;
	return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

export type Human = { author: string; text: string; at: number; invoked: boolean };

/** A human entry's author, text, and time, or undefined for any other entry. */
export function human(entry: EntryRecord): Human | undefined {
	const user = entry.model?.[0];
	if (user?.role !== "user") return;
	if (MessageEntry.is(entry)) return { ...entry.data, at: user.timestamp, invoked: false };
	if (entry.kind !== "pi.user") return;
	const body = text(user);
	const split = body.indexOf(": ");
	const author = body.slice(0, split);
	if (split < 1 || !isAuthor(author)) {
		return { author: "unknown", text: body, at: user.timestamp, invoked: true };
	}
	return { author, text: body.slice(split + 2), at: user.timestamp, invoked: true };
}

export type Room = { name: string; project: string };

export function section(room: Room): PromptSection {
	return {
		key: "ace-channel",
		render: () =>
			[
				`You are an agent in the Ace channel "${room.name}". People and agents share this chat.`,
				"Each human message starts with its author's name and a colon. You see every message, but",
				"you act only when someone invokes you; answer the person who did. Write replies as plain",
				"text without a name prefix: the channel shows who wrote each message.",
				"",
				`The project checkout is ${room.project}. Never edit it directly. Before changing files,`,
				"start a lane for the unit of work with the `lane` tool; start another lane when the work",
				"changes to something unrelated. Your working directory is your current lane.",
			].join("\n"),
	};
}
