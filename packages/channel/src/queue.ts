import {
	type ConversationView,
	type EntryDraft,
	InboxDoc,
	type InboxState,
} from "@earendil-works/pi-durable";

import type { QueuedMessage } from "./protocol";
import { input, MessageEntry } from "./room";

/** Project pi's inbox, including passive human writes but not internal writes such as compaction. */
export function queue(view: ConversationView): QueuedMessage[] {
	const inbox = view.docs[InboxDoc.definition.kind] as InboxState | undefined;
	return (inbox?.items || []).flatMap((item): QueuedMessage[] => {
		if (item.mode !== "write") {
			return [{ submission: item.id, ...input(item.content), invoked: true }];
		}
		const entry = item.entry as unknown as EntryDraft;
		if (entry.kind !== MessageEntry.kind) return [];
		const message = entry.model?.[0];
		if (message?.role !== "user") return [];
		return [{ submission: item.id, ...input(message.content), invoked: false }];
	});
}
