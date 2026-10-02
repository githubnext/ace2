import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./sparkle";

export function sign(app: string, identity: string, release = false): void {
	const bin = join(app, "Contents", "MacOS");
	const framework = join(app, "Contents", "Frameworks", "Sparkle.framework");
	const version = join(framework, "Versions", "B");
	const options = release ? ["--options", "runtime", "--timestamp"] : [];
	// Sign nested code inside out. --deep is only appropriate for verification.
	for (
		const path of [
			join(version, "XPCServices", "Downloader.xpc"),
			join(version, "XPCServices", "Installer.xpc"),
			join(version, "Autoupdate"),
			join(version, "Updater.app"),
			framework,
		]
	) {
		run([
			"/usr/bin/codesign",
			"--force",
			"--sign",
			identity,
			"--preserve-metadata=entitlements",
			...options,
			path,
		]);
	}
	const entitlements = fileURLToPath(new URL("../native/entitlements.plist", import.meta.url));
	for (const path of [...readdirSync(bin).map((file) => join(bin, file)), app]) {
		run([
			"/usr/bin/codesign",
			"--force",
			"--sign",
			identity,
			...options,
			"--entitlements",
			entitlements,
			path,
		]);
	}
	run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app]);
}
