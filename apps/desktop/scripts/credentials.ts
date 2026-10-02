import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { required } from "./release";

if (process.env.GITHUB_ACTIONS !== "true") {
	throw new Error("This script only manages disposable GitHub Actions signing credentials");
}
const directory = join(required("RUNNER_TEMP"), "ace-signing");
const keychain = join(directory, "release.keychain-db");

function security(args: string[]) {
	const result = Bun.spawnSync(["/usr/bin/security", ...args], { stdout: "pipe", stderr: "pipe" });
	if (!result.success) throw new Error(`Signing keychain setup failed at ${args[0]}`);
}

if (process.argv[2] === "clean") {
	Bun.spawnSync(["/usr/bin/security", "delete-keychain", keychain], {
		stdout: "ignore",
		stderr: "ignore",
	});
	rmSync(directory, { recursive: true, force: true });
} else {
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const certificate = join(directory, "developer-id.p12");
	const key = join(directory, "notary.p8");
	writeFileSync(certificate, Buffer.from(required("ACE_CERTIFICATE_P12"), "base64"), {
		mode: 0o600,
	});
	writeFileSync(key, required("ACE_NOTARY_PRIVATE_KEY"), { mode: 0o600 });
	const password = crypto.randomUUID();
	security(["create-keychain", "-p", password, keychain]);
	security(["set-keychain-settings", "-lut", "21600", keychain]);
	security(["unlock-keychain", "-p", password, keychain]);
	security([
		"import",
		certificate,
		"-k",
		keychain,
		"-P",
		required("ACE_CERTIFICATE_PASSWORD"),
		"-T",
		"/usr/bin/codesign",
		"-T",
		"/usr/bin/security",
	]);
	security(["set-key-partition-list", "-S", "apple-tool:,apple:", "-k", password, keychain]);
	security(["list-keychains", "-d", "user", "-s", keychain]);
	writeFileSync(required("GITHUB_ENV"), `ACE_NOTARY_KEY=${key}\n`, { flag: "a" });
	rmSync(certificate);
}
