import { useEffect, useState } from "react";

import type { ChannelInfo, Event } from "@ace/host/protocol";

import { host } from "./host";

export type Tool = {
	call: string;
	name: string;
	args: unknown;
	result?: { error: boolean; text: string };
};

export type Item =
	| { kind: "message"; key: string; at: number; author: string; text: string; invoked: boolean }
	| { kind: "reply"; key: string; at: number; model: string; text: string; tools: Tool[] };

export type Transcript = {
	items: Item[];
	/** Text streamed for the reply being generated. */
	draft: string;
	busy: boolean;
	live: boolean;
};

const EMPTY: Transcript = { items: [], draft: "", busy: false, live: false };

/** Folds channel events into timeline items: tool calls attach to the reply that made them. */
export function apply(state: Transcript, event: Event): Transcript {
	switch (event.kind) {
		case "message":
			return {
				...state,
				items: [...state.items, { kind: "message", key: `e${event.entry}`, ...pick(event) }],
			};
		case "reply": {
			const item: Item = {
				kind: "reply",
				key: `e${event.entry}`,
				at: event.at,
				model: event.model,
				text: event.text,
				tools: [],
			};
			return { ...state, draft: "", items: [...state.items, item] };
		}
		case "tool": {
			const tool: Tool = { call: event.call, name: event.name, args: event.args };
			const last = state.items.at(-1);
			if (last?.kind === "reply" && !last.text) {
				return {
					...state,
					items: [...state.items.slice(0, -1), { ...last, tools: [...last.tools, tool] }],
				};
			}
			if (last?.kind === "reply" && last.at === event.at) {
				return {
					...state,
					items: [...state.items.slice(0, -1), { ...last, tools: [...last.tools, tool] }],
				};
			}
			const item: Item = {
				kind: "reply",
				key: `t${event.call}`,
				at: event.at,
				model: "",
				text: "",
				tools: [tool],
			};
			return { ...state, draft: "", items: [...state.items, item] };
		}
		case "result":
			return {
				...state,
				items: state.items.map((item) =>
					item.kind === "reply" && item.tools.some((tool) => tool.call === event.call)
						? {
							...item,
							tools: item.tools.map((tool) =>
								tool.call === event.call
									? { ...tool, result: { error: event.error, text: event.text } }
									: tool
							),
						}
						: item
				),
			};
		case "delta":
			return { ...state, draft: state.draft + event.text };
		case "run":
			return { ...state, busy: event.state === "start", draft: "" };
		case "live":
			return { ...state, live: true };
	}
}

function pick(event: Extract<Event, { kind: "message" }>) {
	return { at: event.at, author: event.author, text: event.text, invoked: event.invoked };
}

/** Watches one chat of a channel, re-watching after the host reconnects. */
export function useTranscript(channel: string | undefined, chat?: number) {
	const [state, setState] = useState<Transcript>(EMPTY);
	const [info, setInfo] = useState<ChannelInfo>();
	useEffect(() => {
		if (!channel) return;
		let active = true;
		const start = () => {
			setState(EMPTY);
			host.channel<ChannelInfo>(channel, { op: "info" }).then((value) => active && setInfo(value));
			host.channel(channel, { op: "watch", ...(chat === undefined ? {} : { chat }) }, (event) => {
				if (!active) return;
				setState((current) => apply(current, event));
				if (event.kind === "run") {
					host.channel<ChannelInfo>(channel, { op: "info" }).then((value) =>
						active && setInfo(value)
					);
				}
			});
		};
		start();
		const previous = host.onOpen;
		host.onOpen = start;
		return () => {
			active = false;
			host.onOpen = previous;
			host.request({ op: "release", channel }).catch(() => {});
		};
	}, [channel, chat]);
	return { ...state, info };
}
