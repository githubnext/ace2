import { useEffect, useState } from "react";

import type { Image } from "@ace/channel/protocol";
import type { ChannelInfo, Event } from "@ace/host/protocol";

import { host, onOpen } from "./host";

export type Tool = {
	call: string;
	name: string;
	args: unknown;
	result?: { error: boolean; text: string };
};

export type Item =
	| {
		kind: "message";
		key: string;
		at: number;
		author: string;
		text: string;
		images?: Image[];
		invoked: boolean;
	}
	| {
		kind: "reply";
		key: string;
		at: number;
		model: string;
		text: string;
		tools: Tool[];
		error?: string;
		stopped?: boolean;
	};

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
				...(event.error ? { error: event.error } : {}),
				...(event.stopped ? { stopped: true } : {}),
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
				model: event.model,
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
							...(event.stopped ? { stopped: true } : {}),
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
	const { at, author, text, images, invoked } = event;
	return { at, author, text, ...(images ? { images } : {}), invoked };
}

/** Watches one chat of a channel, re-watching after the host reconnects. */
export function useTranscript(channel: string | undefined, chat?: number) {
	const [state, setState] = useState<Transcript>(EMPTY);
	const [info, setInfo] = useState<ChannelInfo>();
	const [error, setError] = useState<string>();
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (!channel) return;
		let active = true;
		let generation = 0;
		const start = () => {
			const version = ++generation;
			setState(EMPTY);
			setInfo(undefined);
			setError(undefined);
			const refresh = () =>
				host.channel<ChannelInfo>(channel, { op: "info" }).then((value) => {
					if (active && version === generation) setInfo(value);
				}, () => {});
			void refresh();
			host.channel(channel, { op: "watch", ...(chat === undefined ? {} : { chat }) }, (event) => {
				if (!active || version !== generation) return;
				setState((current) => apply(current, event));
				if (event.kind === "run") void refresh();
			}).catch((error: Error) => {
				if (active && version === generation) setError(error.message);
			});
		};
		start();
		const off = onOpen(start);
		return () => {
			active = false;
			off();
			host.request({ op: "release", channel }).catch(() => {});
		};
	}, [channel, chat, attempt]);
	return { ...state, info, error, retry: () => setAttempt((value) => value + 1) };
}
