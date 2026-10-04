import { Type } from "@earendil-works/pi-ai";
import {
	configure,
	type ConversationId,
	defineDoc,
	defineExtension,
	defineTool,
	type Extension,
	LiveDoc,
} from "@earendil-works/pi-durable";

import { git, quote } from "./git";

/** Which chat last took each lane. Only that chat may write to it while it is busy. */
export const LanesDoc = defineDoc<
	{ lanes: Record<string, { chat: ConversationId; path: string }> }
>({
	kind: "ace.lanes",
	version: 1,
	scope: "session",
	initial: () => ({ lanes: {} }),
});

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The initial channel name remains the lane prefix after a rename. */
export type Place = { name: string; project: string; lanes: string };

export function lanes(place: Place): Extension {
	return defineExtension({
		name: "ace-lanes",
		tools: [
			defineTool({
				name: "lane",
				description:
					"Start a lane (an isolated Git worktree and branch from the project's current HEAD) for a new unit of work, switch to an existing lane, or list lanes. Starting or switching makes the lane your working directory.",
				parameters: Type.Object({
					action: Type.Union([Type.Literal("start"), Type.Literal("switch"), Type.Literal("list")]),
					name: Type.Optional(
						Type.String({
							description: "Lowercase kebab-case name for the work, such as implement-auth",
						}),
					),
				}),
				// Starting is idempotent: a rerun finds the worktree it created.
				replay: "safe",
				executionMode: "sequential",
				execute: async ({ action, name }, api, context) => {
					const env = api.env!;
					if (action === "list") {
						const state = await api.snapshot(LanesDoc, context);
						const names = Object.keys(state?.lanes || {});
						return { content: [{ type: "text", text: names.join("\n") || "No lanes yet." }] };
					}
					if (!name || !NAME.test(name)) {
						throw new Error("A lane name must be lowercase kebab-case");
					}
					const path = `${place.lanes}/${name}`;
					const exists = await env.exists(path, context);
					if (!exists.ok) throw exists.error;
					if (action === "switch" && !exists.value) throw new Error(`No lane named ${name}`);
					if (action === "start" && !exists.value) {
						await git(
							env,
							`-C ${quote(place.project)} worktree add -b ${place.name}/${name} ${quote(path)}`,
							context,
						);
					}
					const writer = (await api.snapshot(LanesDoc, context))?.lanes[name]?.chat;
					if (writer && writer !== api.conversationId) {
						const live = await api.snapshot(LiveDoc, writer, context);
						if (live?.run) throw new Error(`Lane ${name} is in use by another busy chat`);
					}
					await api.commit(async (tx) => {
						const doc = await tx.doc(LanesDoc);
						doc.lanes[name] = { chat: api.conversationId, path };
						await configure(tx, api.conversationId, { cwd: path });
					}, context);
					const verb = exists.value ? "Switched to" : "Started";
					return {
						content: [{
							type: "text",
							text: `${verb} lane ${name} on branch ${place.name}/${name} at ${path}`,
						}],
					};
				},
			}),
		],
	});
}
