#!/usr/bin/env bun
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { ChannelInfo, ChatId, Event } from "@ace/channel/protocol";

import * as catalog from "./catalog";
import { Connection, request } from "./client";
import * as directory from "./directory";
import { serve } from "./gateway";
import { forget, store } from "./keys";
import { dir as logDir, failure, log, open as openLog } from "./log";
import { type Filter, follow, print } from "./logs";
import {
	archive,
	defaultModel,
	host,
	isRunning,
	kill,
	models,
	parseModel,
	project,
	remove,
} from "./manage";

const HELP = `ace — channels on this host

  ace new [--project <dir>] [--name <name>] [--model <provider/id>] [--hosted <url>]
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
  ace key set <NAME>                             store a key in the OS keychain, read from stdin
  ace key rm <NAME>
  ace directory [<url> | off]                    the team's directory, which lists every host's channels
  ace serve [--port 4140]                         serve the app and its WebSocket gateway
  ace logs [--channel <ref>] [--trace <id>] [--level warn] [--since 10m] [--grep <text>]
           [-n 200] [--follow] [--json]              every process's logs, merged in time order
  ace archive <channel> | unarchive <channel> | delete <channel>

Models are provider/id, such as openai/gpt-6-astra or anthropic/claude-opus-5-5.
A credential such as OPENAI_API_KEY comes from ACE_OPENAI_API_KEY, then OPENAI_API_KEY, then the
keychain. Store keys there for the desktop app, which starts without your shell's environment.`;

const { values: flags, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		project: { type: "string" },
		name: { type: "string" },
		model: { type: "string" },
		hosted: { type: "string" },
		chat: { type: "string" },
		port: { type: "string" },
		all: { type: "boolean" },
		detach: { type: "boolean" },
		channel: { type: "string" },
		trace: { type: "string" },
		level: { type: "string" },
		since: { type: "string" },
		grep: { type: "string" },
		lines: { type: "string", short: "n" },
		follow: { type: "boolean", short: "f" },
		json: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	},
});
const [command, ref, ...rest] = positionals;

const model = parseModel;

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
		case "reply": {
			const ending = event.error
				? `\x1b[31m${event.text ? "\n" : ""}Run failed: ${event.error}\x1b[0m`
				: event.stopped
				? dim(`${event.text ? "\n" : ""}Stopped.`)
				: "";
			return console.log(`${tag}${bold(event.model)}: ${event.text}${ending}`);
		}
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

/** `10m`, `2h`, `1d`, or an ISO time. */
function since(value: string): number {
	const match = /^(\d+)([smhd])$/.exec(value);
	if (!match) return Date.parse(value);
	const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[match[2] as "s" | "m" | "h" | "d"];
	return Date.now() - Number(match[1]) * unit;
}

async function main() {
	if (flags.help || !command) return console.log(HELP);
	if (command !== "serve" && command !== "logs") {
		openLog("cli");
		log("info", "cli.command", { command, ...(ref ? { ref } : {}) });
	}
	switch (command) {
		case "logs": {
			const filter: Filter = {};
			// Ids of channels this host doesn't know, such as a peer's, filter as given.
			if (flags.channel) {
				filter.channel = catalog.list().find((r) => r.name === flags.channel)?.id ?? flags.channel;
			}
			if (flags.trace) filter.trace = flags.trace;
			if (flags.level) filter.level = flags.level;
			if (flags.since) filter.since = since(flags.since);
			if (flags.grep) filter.grep = flags.grep;
			if (flags.follow) return follow(filter, !!flags.json);
			print(filter, Number(flags.lines || 200), !!flags.json);
			if (!flags.json) console.error(`\x1b[2m${logDir}\x1b[0m`);
			return;
		}
		case "new": {
			const dir = project(resolve(flags.project || "."));
			const model = flags.model ? parseModel(flags.model) : await defaultModel();
			const record = flags.hosted
				? await host(dir, model, flags.name, flags.hosted)
				: catalog.create(dir, model, flags.name);
			return console.log(`${record.name}\t${record.id}`);
		}
		case "ls": {
			for (const record of catalog.list()) {
				if (record.archived && !flags.all) continue;
				const running = isRunning(record.id) ? "running" : "dormant";
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
			for (const m of await models()) console.log(`${m.provider}/${m.modelId}`);
			return;
		}
		case "directory": {
			if (ref) directory.configure(ref === "off" ? undefined : ref);
			return console.log(directory.url() ?? "No directory");
		}
		case "serve":
			return serve(Number(flags.port || 4140));
		case "key": {
			const name = rest[0];
			if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
				throw new Error("ace key set|rm <NAME>, such as OPENAI_API_KEY");
			}
			if (ref === "rm") {
				return console.log(await forget(name) ? `Removed ${name}` : `No ${name} in the keychain`);
			}
			if (ref !== "set") throw new Error("ace key set|rm <NAME>");
			// From stdin so the key stays out of shell history and the process list.
			if (process.stdin.isTTY) process.stderr.write(`${name} (end with Ctrl-D): `);
			const value = (await new Response(Bun.stdin.stream()).text()).trim();
			if (!value) throw new Error("No key on stdin");
			await store(name, value);
			return console.log(`Stored ${name} in the keychain`);
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
			return kill(record.id);
		case "share":
			await request(record.id, { op: "share", author: catalog.user, shared: rest[0] === "on" });
			return;
		case "archive":
			return void (await archive(record.id, true));
		case "unarchive":
			return void (await archive(record.id, false));
		case "delete":
			await remove(record.id);
			return console.log(`Deleted ${record.name}. Its lane branches remain in ${record.project}.`);
	}
	throw new Error(`Unknown command ${command}\n\n${HELP}`);
}

main().then(
	() => process.exit(0),
	(error: Error) => {
		log("error", "cli.failed", { command, ...failure(error) });
		console.error(error.message);
		process.exit(1);
	},
);
