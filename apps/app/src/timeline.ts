import type { Event } from "@ace/ui";

import type { Item, Tool } from "./transcript";

const AGENT = "ace:agent";
const MENTION = /(?<=^|\s)@([a-zA-Z0-9_-]+)/g;

function text(value: string): Event.Message.Content.Text {
	const parts = [...value.matchAll(MENTION)].map((match) => ({
		type: "mention" as const,
		value: match[1]!,
		index: match.index,
	}));
	return parts.length ? { type: "text", text: value, parts } : { type: "text", text: value };
}

function tool(tool: Tool, busy: boolean): Event.Message.Content.Tool {
	const status = tool.result ? (tool.result.error ? "error" : "success") : busy ? "start" : "error";
	return {
		type: "tool",
		id: tool.call,
		name: tool.name,
		arguments: (tool.args ?? {}) as Record<string, unknown>,
		status,
		...(tool.result
			? {
				result: {
					content: tool.result.text,
					...(tool.result.images
						? {
							images: tool.result.images.map((image) =>
								`data:${image.mimeType};base64,${image.data}`
							),
						}
						: {}),
				},
			}
			: {}),
	};
}

/**
 * Channel transcript items in the shape the original timeline renders. The streamed draft joins
 * the timeline as the newest agent message so it is laid out and scrolled like the rest.
 */
export function toEvents(
	items: Item[],
	topic: string,
	busy: boolean,
	draft: { text: string; model?: string },
): Event[] {
	const events = items.map((item) => {
		const base = {
			id: `${topic}::${item.key}`,
			uid: item.key,
			type: "message",
			topic,
			created_at: Math.floor(item.at / 1000),
		} as const;
		if (item.kind === "message") {
			return {
				...base,
				// Authors are Tailscale logins; the name before the domain reads as a handle.
				sender: { kind: "user", value: item.author, display: item.author.split("@")[0]! },
				content: [
					text(item.invoked && !/(^|\s)@ace\b/i.test(item.text) ? `@ace ${item.text}` : item.text),
					...(item.images || []).map((image) => ({
						type: "image" as const,
						image: `data:${image.mimeType};base64,${image.data}`,
					})),
				],
			} as Event;
		}
		const content: Event.Message.Agent["content"] = item.tools.map((call) => tool(call, busy));
		if (item.text) content.push(text(item.text));
		if (item.error) content.push(text(`Run failed: ${item.error}`));
		if (item.stopped) content.push(text("Stopped."));
		return {
			...base,
			sender: { kind: "agent", value: AGENT, display: item.model || "Agent" },
			content,
		} as Event;
	});
	if (!draft.text) return events;
	events.push({
		id: `${topic}::draft`,
		uid: "draft",
		type: "message",
		topic,
		created_at: Math.floor(Date.now() / 1000),
		sender: { kind: "agent", value: AGENT, display: draft.model || "Agent" },
		content: [text(draft.text)],
		streaming: true,
	} as Event);
	return events;
}
