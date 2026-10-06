import { useSyncExternalStore } from "react";

import type { Changes } from "@ace/channel/protocol";
import type { ChannelInfo } from "@ace/host/protocol";

import type { Item } from "./transcript";

/** What an open channel's views know, shared with its details sidebar outside their tree. */
export type Details = {
	info?: ChannelInfo;
	changes?: Changes;
	items?: Item[];
	/** Whether teammates may invoke agents, as the chat's watch reports it. */
	shared?: boolean;
	/** Whether the watch follows sharing changes; older hosts report only a snapshot. */
	sharedLive?: boolean;
	/** Shows the chat's Diff tab, opening one when none is open. */
	diff?: () => void;
};

const EMPTY: Details = {};
const values = new Map<string, Details>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}

export function publish(channel: string, patch: Details) {
	values.set(channel, { ...values.get(channel), ...patch });
	for (const listener of listeners) listener();
}

export function forget(channel: string) {
	values.delete(channel);
	for (const listener of listeners) listener();
}

export function useDetails(channel: string): Details {
	return useSyncExternalStore(subscribe, () => values.get(channel) || EMPTY);
}
