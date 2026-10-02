import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const version = "2.10.0";
const checksum = "c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c";

export function run(command: string[], options: { cwd?: string } = {}): void {
	// Bun's implicit child environment misses variables assigned while assembling a release.
	const result = Bun.spawnSync(command, {
		env: process.env,
		stdio: ["ignore", "inherit", "inherit"],
		...options,
	});
	if (!result.success) throw new Error(`${command[0]} failed with exit code ${result.exitCode}`);
}

/** Pin the native SDK just as tightly as packages in bun.lock. */
export async function sparkle(): Promise<string> {
	const cache = fileURLToPath(new URL(`../.tmp/sparkle/${version}`, import.meta.url));
	if (existsSync(join(cache, ".verified"))) return cache;
	const temporary = `${cache}-${process.pid}`;
	mkdirSync(temporary, { recursive: true });
	try {
		const response = await fetch(
			`https://github.com/sparkle-project/Sparkle/releases/download/${version}/Sparkle-${version}.tar.xz`,
			{ signal: AbortSignal.timeout(120_000) },
		);
		if (!response.ok) throw new Error(`Sparkle download failed: ${response.status}`);
		const archive = Buffer.from(await response.arrayBuffer());
		if (createHash("sha256").update(archive).digest("hex") !== checksum) {
			throw new Error("Sparkle SDK checksum does not match the pinned release");
		}
		const path = join(temporary, "sdk.tar.xz");
		writeFileSync(path, archive);
		run(["/usr/bin/tar", "-xJf", path, "-C", temporary]);
		rmSync(path);
		writeFileSync(join(temporary, ".verified"), checksum);
		renameSync(temporary, cache);
		return cache;
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}

if (import.meta.main) console.log(await sparkle());
