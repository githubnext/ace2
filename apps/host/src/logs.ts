import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";

import { files } from "./log";

export type Filter = {
	channel?: string;
	trace?: string;
	level?: string;
	since?: number;
	grep?: string;
};

type Record = { t: string; level: string; event: string; proc: string; [field: string]: unknown };

const RANK: { [level: string]: number } = { debug: 0, info: 1, warn: 2, error: 3 };
const COLOR: { [level: string]: string } = { debug: "2", info: "0", warn: "33", error: "31" };
const HIDDEN = new Set(["t", "level", "event", "proc", "pid", "stack"]);

function matches(record: Record, line: string, filter: Filter): boolean {
	if (filter.channel && record.channel !== filter.channel) return false;
	if (filter.trace && record.trace !== filter.trace) return false;
	if (filter.level && RANK[record.level]! < RANK[filter.level]!) return false;
	if (filter.since && Date.parse(record.t) < filter.since) return false;
	if (filter.grep && !line.includes(filter.grep)) return false;
	return true;
}

function parse(text: string, filter: Filter): { record: Record; line: string }[] {
	const out: { record: Record; line: string }[] = [];
	for (const line of text.split("\n")) {
		if (!line) continue;
		try {
			const record = JSON.parse(line) as Record;
			if (matches(record, line, filter)) out.push({ record, line });
		} catch {
			// A line cut short by a crash mid-write; the rest of the file is intact.
		}
	}
	return out;
}

function format({ record }: { record: Record }): string {
	const time = record.t.slice(11, 23);
	const fields = Object.entries(record).filter(([key]) => !HIDDEN.has(key)).map(([key, value]) =>
		`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`
	).join(" ");
	const head = `\x1b[${COLOR[record.level]}m${time} ${
		record.level.padEnd(5)
	} ${record.event}\x1b[0m`;
	const stack = record.stack ? `\n${String(record.stack).replace(/^/gm, "    ")}` : "";
	return `${head} \x1b[2m${record.proc}\x1b[0m ${fields}${stack}`;
}

/** Every process's lines, merged in time order. */
export function print(filter: Filter, limit: number, json: boolean): void {
	const records = files().flatMap((file) => parse(readFileSync(file, "utf8"), filter));
	records.sort((a, b) => a.record.t.localeCompare(b.record.t));
	for (const entry of records.slice(-limit)) console.log(json ? entry.line : format(entry));
}

/** New lines from every file as they are written, including files created after starting. */
export async function follow(filter: Filter, json: boolean): Promise<never> {
	const offsets = new Map(files().map((file) => [file, statSync(file).size]));
	for (;;) {
		await Bun.sleep(500);
		const batch: { record: Record; line: string }[] = [];
		for (const file of files()) {
			const size = statSync(file).size;
			let offset = offsets.get(file) ?? 0;
			// Rotation replaced the file; read the new one from the start.
			if (size < offset) offset = 0;
			if (size === offset) continue;
			const fd = openSync(file, "r");
			const buffer = Buffer.alloc(size - offset);
			readSync(fd, buffer, 0, buffer.length, offset);
			closeSync(fd);
			const text = buffer.toString("utf8");
			// Keep a partial last line for the next pass.
			const end = text.lastIndexOf("\n") + 1;
			offsets.set(file, offset + Buffer.byteLength(text.slice(0, end)));
			batch.push(...parse(text.slice(0, end), filter));
		}
		batch.sort((a, b) => a.record.t.localeCompare(b.record.t));
		for (const entry of batch) console.log(json ? entry.line : format(entry));
	}
}
