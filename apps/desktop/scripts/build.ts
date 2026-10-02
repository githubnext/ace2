import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./sparkle";

export const root = fileURLToPath(new URL("..", import.meta.url));

export async function build(channel: string, launch = false): Promise<void> {
	if (process.platform !== "darwin" || process.arch !== "arm64") {
		throw new Error("Ace desktop currently builds on Apple silicon Macs");
	}
	if (!["dev", "stable", "canary"].includes(channel)) {
		throw new Error("Choose dev, stable, or canary");
	}
	process.env.ACE_BUILD_CHANNEL = channel;
	const sdk = join(root, "node_modules", "electrobun");
	const cli = join(sdk, "bin", "electrobun");
	if (!existsSync(cli)) {
		const version = (await Bun.file(join(sdk, "package.json")).json()).version;
		if (version !== "1.18.1") {
			throw new Error("Update the pinned Electrobun CLI checksum with its version");
		}
		const response = await fetch(
			`https://github.com/blackboardsh/electrobun/releases/download/v${version}/electrobun-cli-darwin-arm64.tar.gz`,
		);
		if (!response.ok) throw new Error(`Electrobun CLI download failed: ${response.status}`);
		const archive = Buffer.from(await response.arrayBuffer());
		if (
			createHash("sha256").update(archive).digest("hex")
				!== "1ef4a4b42a957d3349f491f7fbe53153d1d5f427bacbda340c8d7fadce6b58d9"
		) {
			throw new Error("Electrobun CLI checksum does not match the pinned release");
		}
		const cache = join(root, ".tmp");
		mkdirSync(cache, { recursive: true });
		const path = join(cache, "electrobun-cli.tar.gz");
		writeFileSync(path, archive);
		run(["/usr/bin/tar", "-xzf", path, "-C", join(sdk, "bin")]);
		rmSync(path);
	}
	// The compiled CLI's appended Bun program invalidates its upstream ad-hoc signature.
	run(["/usr/bin/codesign", "--force", "--sign", "-", cli]);
	run([process.execPath, "scripts/stage.ts"], { cwd: root });
	run([cli, launch ? "dev" : "build", `--env=${channel}`], { cwd: root });
}

if (import.meta.main) await build(process.argv[2] || "dev", process.argv.includes("--run"));
