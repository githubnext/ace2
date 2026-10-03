import { createHash } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import * as catalog from "./catalog";

async function checksum(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest("hex");
}

function snapshot(source: string, target: string): void {
	const database = new DatabaseSync(source, { readOnly: true, timeout: 5_000 });
	try {
		// INTO includes committed WAL data without changing or stopping the live channel.
		database.exec("PRAGMA synchronous = FULL");
		database.prepare("VACUUM INTO ?").run(target);
	} finally {
		database.close();
	}
	chmodSync(target, 0o600);
	const copy = new DatabaseSync(target, { readOnly: true });
	try {
		const rows = copy.prepare("PRAGMA quick_check").all();
		if (rows.length !== 1 || rows[0]!.quick_check !== "ok") {
			throw new Error("The channel backup failed SQLite's integrity check");
		}
	} finally {
		copy.close();
	}
}

/** A channel storage snapshot; project files and lane worktrees need their own backup. */
export async function backup(record: catalog.Listing, directory: string): Promise<string> {
	if (record.hosted) throw new Error("Hosted channel backups must be taken on the hosting service");
	const path = resolve(directory);
	// An existing destination must never be overwritten or removed by failed-backup cleanup.
	mkdirSync(path, { mode: 0o700 });
	try {
		const source = catalog.paths(record.id);
		writeFileSync(join(path, "channel.json"), `${JSON.stringify(record, null, "\t")}\n`, {
			mode: 0o600,
			flag: "wx",
		});
		const names = ["channel.json"];
		if (existsSync(source.storage)) {
			snapshot(source.storage, join(path, "channel.sqlite"));
			names.push("channel.sqlite");
		}
		const files = await Promise.all(names.map(async (file) => ({
			path: file,
			sha256: await checksum(join(path, file)),
		})));
		const manifest = {
			format: 1,
			created: new Date().toISOString(),
			channel: record.id,
			home: catalog.home,
			project: record.project,
			lanes: source.lanes,
			files,
		};
		// Written last: a partial directory is never advertised as a completed backup.
		writeFileSync(join(path, "backup.json"), `${JSON.stringify(manifest, null, "\t")}\n`, {
			mode: 0o600,
			flag: "wx",
		});
		return path;
	} catch (error) {
		rmSync(path, { recursive: true, force: true });
		throw error;
	}
}
