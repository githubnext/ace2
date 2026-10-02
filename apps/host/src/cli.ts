#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { builtinModels } from "@earendil-works/pi-ai/providers/all";

import type { ChannelInfo, ChatId, Event, ModelRef } from "@ace/channel/protocol";

import * as catalog from "./catalog";
import { Connection, request } from "./client";

const HELP = `ace — channels on this host

  ace new [--project <dir>] [--name <name>] [--model <provider/id>]
  ace ls [--all]
  ace info <channel>
  ace say <channel> [--chat <id>] <text…>        post without invoking the agent
  ace ask <channel> [--chat <id>] [--model <provider/id>] [--detach] <text…>
  ace watch <channel> [--chat <id>]
  ace chat <channel> [--model <provider/id>]     open another chat
  ace stop <channel> [--chat <id>]               stop the chat's current run
  ace kill <channel>                             stop all work in the channel now
  ace share <channel> on|off                     let others invoke agents
  ace models
  ace archive <channel> | unarchive <channel> | delete <channel>

Models are provider/id, such as openai/gpt-6-astra or anthropic/claude-opus-5-5.
Credentials come from provider environment variables such as OPENAI_API_KEY.`;

const PREFERRED = ["anthropic/claude-opus-5-5", "openai/gpt-6-astra"];

const { values: flags, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		project: { type: "string" },
		name: { type: "string" },
		model: { type: "string" },
		chat: { type: "string" },
		all: { type: "boolean" },
		detach: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	},
});
const [command, ref, ...rest] = positionals;

function model(value: string): ModelRef {
	const split = value.indexOf("/");
	if (split < 1) throw new Error("A model is written provider/id, such as openai/gpt-6-astra");
	return { provider: value.slice(0, split), modelId: value.slice(split + 1) };
}

async function defaultModel(): Promise<ModelRef> {
	if (flags.model) return model(flags.model);
	if (process.env.ACE_MODEL) return model(process.env.ACE_MODEL);
	const available = new Set(
		(await builtinModels().getAvailable()).map((m) => `${m.provider}/${m.id}`),
	);
	const chosen = PREFERRED.find((candidate) => available.has(candidate));
	if (!chosen) {
		throw new Error(
			"No model credentials found; set OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --model",
		);
	}
	return model(chosen);
}

function project(dir: string): string {
	const result = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
		encoding: "utf8",
	});
	if (result.status !== 0) throw new Error(`${dir} is not inside a Git repository`);
	return result.stdout.trim();
}

function chat(): ChatId | undefined {
	return flags.chat === undefined ? undefined : Number(flags.chat);
}

const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

function clip(text: string, length: number): string {
	const line = text.replace(/\s+/g, " ").trim();
	return line.length > length ? `${line.slice(0, length - 1)}…` : line;
}

function render(event: Event, info: ChannelInfo) {
	const tag = event.chat === 1 && info.chats.length === 1 ? "" : dim(`[${event.chat}] `);
	switch (event.kind) {
		case "message":
			return console.log(`${tag}${bold(event.author)}: ${event.text}`);
		case "reply":
			return console.log(`${tag}${bold(event.model)}: ${event.text}`);
		case "tool":
			return console.log(dim(`${tag}  → ${event.name} ${clip(JSON.stringify(event.args), 100)}`));
		case "result":
			return console.log(dim(`${tag}  ${event.error ? "✗" : "←"} ${clip(event.text, 100)}`));
		case "run":
			return event.state === "end" && console.log(dim(`${tag}  (run ended)`));
	}
}

async function watch(id: string, until?: (event: Event) => boolean, replay = true) {
	const connection = await Connection.open(id);
	const info = await connection.request<ChannelInfo>({ op: "info" });
	let live = false;
	const done = Promise.withResolvers<void>();
	await connection.request({ op: "watch", chat: chat() }, (event) => {
		if (event.kind === "live") return void (live = true);
		if (live || replay) render(event, info);
		if (live && until?.(event)) done.resolve();
	});
	return { connection, done: done.promise };
}

async function main() {
	if (flags.help || !command) return console.log(HELP);
	switch (command) {
		case "new": {
			const record = catalog.create(
				project(resolve(flags.project || ".")),
				await defaultModel(),
				flags.name,
			);
			return console.log(`${record.name}\t${record.id}`);
		}
		case "ls": {
			for (const record of catalog.list()) {
				if (record.archived && !flags.all) continue;
				const running = existsSync(catalog.paths(record.id).socket) ? "running" : "dormant";
				const state = record.archived ? "archived" : running;
				console.log(
					[
						record.name,
						record.id,
						state,
						`${record.model.provider}/${record.model.modelId}`,
						record.project,
					].join("\t"),
				);
			}
			return;
		}
		case "models": {
			for (const m of await builtinModels().getAvailable()) console.log(`${m.provider}/${m.id}`);
			return;
		}
	}

	if (!ref) throw new Error(`ace ${command} needs a channel`);
	const record = catalog.find(ref);
	const text = rest.join(" ");
	switch (command) {
		case "info":
			return console.log(JSON.stringify(await request(record.id, { op: "info" }), null, 2));
		case "say":
			if (!text) throw new Error("Nothing to say");
			await request(record.id, { op: "say", chat: chat(), author: catalog.user, text });
			return;
		case "ask": {
			if (!text) throw new Error("Nothing to ask");
			const selected = flags.model ? model(flags.model) : undefined;
			const body = {
				op: "ask",
				chat: chat(),
				author: catalog.user,
				text,
				model: selected,
			} as const;
			if (flags.detach) return void (await request(record.id, body));
			const { connection } = await watch(record.id, undefined, false);
			const { submission } = await connection.request<{ submission: number }>(body);
			process.on("SIGINT", () => {
				console.log(dim(`\nDetached; the run continues. Stop it with: ace stop ${record.name}`));
				process.exit(130);
			});
			const status = await connection.request<string>({ op: "wait", submission });
			if (status === "unanswered") console.log(dim("  (stopped before answering)"));
			return connection.close();
		}
		case "watch": {
			const { connection } = await watch(record.id);
			return connection.closed;
		}
		case "chat": {
			const body = {
				op: "chat",
				author: catalog.user,
				model: flags.model ? model(flags.model) : undefined,
			} as const;
			const created = await request<{ chat: number }>(record.id, body);
			return console.log(created.chat);
		}
		case "stop":
			await request(record.id, { op: "stop", chat: chat() });
			return;
		case "kill":
			if (!existsSync(catalog.paths(record.id).socket)) return;
			await request(record.id, { op: "kill" });
			return;
		case "share":
			await request(record.id, { op: "share", author: catalog.user, shared: rest[0] === "on" });
			return;
		case "archive":
			if (existsSync(catalog.paths(record.id).socket)) await request(record.id, { op: "kill" });
			return catalog.write({ ...record, archived: true });
		case "unarchive":
			return catalog.write({ ...record, archived: false });
		case "delete": {
			if (existsSync(catalog.paths(record.id).socket)) await request(record.id, { op: "kill" });
			const lanes = catalog.paths(record.id).lanes;
			for (const lane of existsSync(lanes) ? readdirSync(lanes) : []) {
				spawnSync("git", [
					"-C",
					record.project,
					"worktree",
					"remove",
					"--force",
					`${lanes}/${lane}`,
				]);
			}
			catalog.remove(record.id);
			return console.log(`Deleted ${record.name}. Its lane branches remain in ${record.project}.`);
		}
	}
	throw new Error(`Unknown command ${command}\n\n${HELP}`);
}

main().then(
	() => process.exit(0),
	(error: Error) => {
		console.error(error.message);
		process.exit(1);
	},
);
