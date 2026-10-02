import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { run, sparkle } from "./sparkle";

const build = process.env.ELECTROBUN_BUILD_DIR;
const channel = process.env.ELECTROBUN_BUILD_ENV;
const identifier = process.env.ELECTROBUN_APP_IDENTIFIER;
if (!build || !channel || !identifier) throw new Error("Run this script through Electrobun");
if (process.env.ELECTROBUN_OS !== "macos") throw new Error("Ace Helper currently supports macOS");
const compiler = Bun.which("bun");
if (!compiler) throw new Error("Building Ace Helper requires Bun 1.4 or newer on PATH");
const runtime = Bun.spawnSync([compiler, "--version"]);
if (!runtime.success || !Bun.semver.satisfies(runtime.stdout.toString().trim(), ">=1.4.0")) {
	throw new Error("Building Ace Helper requires Bun 1.4 or newer on PATH for node:sqlite support");
}
const app = readdirSync(build).find((name) => name.endsWith(".app"));
if (!app) throw new Error("The Ace application bundle is missing");
const contents = join(build, app, "Contents");
const bin = join(contents, "MacOS");
const native = fileURLToPath(new URL("../native", import.meta.url));
run([
	"/usr/bin/plutil",
	"-insert",
	"LSMinimumSystemVersion",
	"-string",
	"14.0",
	join(contents, "Info.plist"),
]);

// Only the helper needs node:sqlite; changing Electrobun's runtime breaks its native callbacks.
run([
	compiler,
	"build",
	fileURLToPath(new URL("../../host/src/helper.ts", import.meta.url)),
	"--compile",
	"--no-compile-autoload-dotenv",
	"--no-compile-autoload-bunfig",
	"--define",
	`ACE_CHANNEL=${JSON.stringify(channel)}`,
	"--outfile",
	join(bin, "Ace Helper"),
]);
// Bun appends the embedded program after linking; refresh its local development signature.
run(["codesign", "--force", "--sign", "-", join(bin, "Ace Helper")]);

run([
	"xcrun",
	"clang",
	"-dynamiclib",
	"-fobjc-arc",
	"-mmacosx-version-min=14.0",
	"-framework",
	"Foundation",
	"-framework",
	"ServiceManagement",
	join(native, "service.m"),
	"-o",
	join(bin, "ace-service.dylib"),
]);

run([
	"xcrun",
	"clang",
	"-dynamiclib",
	"-fobjc-arc",
	"-mmacosx-version-min=14.0",
	"-framework",
	"Cocoa",
	"-framework",
	"QuartzCore",
	join(native, "window.m"),
	"-o",
	join(bin, "ace-window.dylib"),
]);

const sdk = await sparkle();
writeFileSync(
	join(contents, "Resources", "Sparkle-LICENSE.txt"),
	readFileSync(join(sdk, "LICENSE")),
);
const frameworks = join(contents, "Frameworks");
mkdirSync(frameworks, { recursive: true });
run(["/usr/bin/ditto", join(sdk, "Sparkle.framework"), join(frameworks, "Sparkle.framework")]);
run([
	"xcrun",
	"clang",
	"-dynamiclib",
	"-fobjc-arc",
	"-mmacosx-version-min=14.0",
	"-framework",
	"Cocoa",
	"-F",
	sdk,
	"-framework",
	"Sparkle",
	"-Wl,-rpath,@loader_path/../Frameworks",
	join(native, "updates.m"),
	"-o",
	join(bin, "ace-updates.dylib"),
]);

if (channel !== "dev") {
	const origin = process.env.ACE_UPDATE_URL;
	const key = process.env.ACE_UPDATE_PUBLIC_KEY;
	if (!origin || !key || Buffer.from(key, "base64").length !== 32) {
		throw new Error("Release builds need ACE_UPDATE_URL and a valid ACE_UPDATE_PUBLIC_KEY");
	}
	const url = new URL(`${origin.replace(/\/$/, "")}/${channel}/macos-${process.arch}/appcast.xml`);
	if (url.protocol !== "https:") throw new Error("The release update URL must use HTTPS");
	const plist = join(contents, "Info.plist");
	for (
		const [name, type, value] of [
			["SUFeedURL", "string", url.href],
			["SUPublicEDKey", "string", key],
			["SURequireSignedFeed", "bool", "YES"],
			["SUVerifyUpdateBeforeExtraction", "bool", "YES"],
			["SUEnableAutomaticChecks", "bool", "YES"],
			["SUAllowsAutomaticUpdates", "bool", "NO"],
			["SUScheduledCheckInterval", "integer", "21600"],
		]
	) run(["/usr/bin/plutil", "-insert", name, `-${type}`, value, plist]);
}

const agents = join(contents, "Library", "LaunchAgents");
mkdirSync(agents, { recursive: true });
writeFileSync(
	join(agents, `${identifier}.helper.plist`),
	readFileSync(join(native, "helper.plist"), "utf8").replaceAll("dev.ace.desktop", identifier),
);
