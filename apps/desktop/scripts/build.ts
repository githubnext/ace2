import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { config, desktop } from "@ace/host/config";
import { health } from "@ace/host/health";

import { run } from "./sparkle";

export const root = fileURLToPath(new URL("..", import.meta.url));

export async function build(channel: string): Promise<void> {
	if (process.platform !== "darwin" || process.arch !== "arm64") {
		throw new Error("Ace desktop currently builds on Apple silicon Macs");
	}
	if (!["dev", "stable", "canary"].includes(channel)) {
		throw new Error("Choose dev, stable, or canary");
	}
	// macOS binds the installed helper's launch constraint to its signature; ad-hoc replacements fail it.
	if (process.env.ACE_DEV_INSTALL && (process.env.ACE_CODESIGN_IDENTITY || "-") === "-") {
		throw new Error(
			"Set ACE_CODESIGN_IDENTITY to your Apple Development identity to build Ace-dev",
		);
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
	run([cli, "build", `--env=${channel}`], { cwd: root });
}

/** Runs this checkout's development app with its own source host and isolated profile. */
async function dev(): Promise<void> {
	await build("dev");
	const bin = join(root, "dist", "dev-macos-arm64", "Ace-dev.app", "Contents", "MacOS");
	const { identifier } = await Bun.file(join(bin, "..", "Resources", "version.json")).json() as {
		identifier: string;
	};
	if (!desktop(identifier)) throw new Error(`${identifier} is not a checkout development build`);
	// Attaching to an existing listener would serve another run's or checkout's code.
	const running = await health(config.port);
	if (running) {
		throw new Error(
			`Port ${config.port} already has an Ace host (PID ${running.pid}) for ${running.home}. Stop it, or set ACE_PORT.`,
		);
	}
	const host = Bun.spawn([
		process.execPath,
		"--no-env-file",
		join(root, "..", "host", "src", "cli.ts"),
		"serve",
	], {
		env: {
			...process.env,
			ACE_HOME: config.home,
			ACE_CONFIG_HOME: config.settings,
			ACE_KEYCHAIN_SERVICE: config.keychain,
			ACE_PORT: String(config.port),
		},
		stdio: ["ignore", "inherit", "inherit"],
	});
	try {
		const deadline = Date.now() + 30_000;
		while (!(await health(config.port))) {
			if (host.exitCode !== null || Date.now() > deadline) {
				throw new Error(`This checkout's Ace host did not start on port ${config.port}`);
			}
			await Bun.sleep(100);
		}
		console.log(`Ace-dev ${identifier}: ${config.home}, port ${config.port}`);
		const app = Bun.spawn([join(bin, "launcher")], {
			cwd: bin,
			stdio: ["ignore", "inherit", "inherit"],
		});
		for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => app.kill(signal));
		void host.exited.then(() => app.kill());
		await app.exited;
	} finally {
		host.kill("SIGTERM");
		await host.exited;
	}
}

if (import.meta.main) {
	if (process.argv.includes("--run")) await dev();
	else await build(process.argv[2] || "dev");
}
