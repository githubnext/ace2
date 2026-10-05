import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./sparkle";

export function sign(app: string, identity: string, release = false): void {
	const bin = join(app, "Contents", "MacOS");
	const frameworks = join(app, "Contents", "Frameworks");
	const framework = join(frameworks, "Sparkle.framework");
	const version = join(framework, "Versions", "B");
	const options = release ? ["--options", "runtime", "--timestamp"] : [];
	const bundle = Bun.spawnSync([
		"/usr/bin/plutil",
		"-extract",
		"CFBundleIdentifier",
		"raw",
		"-o",
		"-",
		join(app, "Contents", "Info.plist"),
	]);
	if (!bundle.success) throw new Error("Cannot read the desktop bundle identifier for signing");
	const identifier = bundle.stdout.toString().trim();
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
	for (const file of readdirSync(frameworks).filter((name) => name.endsWith(".dylib"))) {
		run(["/usr/bin/codesign", "--force", "--sign", identity, ...options, join(frameworks, file)]);
	}
	const entitlements = fileURLToPath(new URL("../native/entitlements.plist", import.meta.url));
	for (const path of [...readdirSync(bin).map((file) => join(bin, file)), app]) {
		const desktop = path === join(bin, "ace-desktop-client");
		run([
			"/usr/bin/codesign",
			"--force",
			"--sign",
			identity,
			...options,
			...(desktop
				? ["--identifier", `${identifier}.desktop-client`]
				: path.endsWith(".dylib")
				? []
				: ["--entitlements", entitlements]),
			path,
		]);
	}
	run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app]);
}
