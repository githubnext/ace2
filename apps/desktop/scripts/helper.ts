import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
// Runtime isolation must not change the macOS identity that owns development permissions.
const profile = channel === "dev" && !process.env.ACE_DEV_INSTALL
	? createHash("sha256").update(dirname(import.meta.dirname)).digest("hex").slice(0, 8)
	: undefined;
writeFileSync(join(contents, "Resources", "profile.json"), JSON.stringify({ profile }));
const native = fileURLToPath(new URL("../native", import.meta.url));
if (channel === "dev") {
	run([
		"xcrun",
		"clang",
		"-fobjc-arc",
		"-mmacosx-version-min=15.0",
		"-framework",
		"AppKit",
		join(native, "dev.m"),
		"-o",
		join(bin, "ace-dev-launcher"),
	]);
}
const swift = Bun.spawnSync(["xcrun", "swift", "--version"]);
const swiftVersion = /Swift version (\d+)\.(\d+)/.exec(swift.stdout.toString());
if (
	!swift.success || !swiftVersion || Number(swiftVersion[1]) < 6
	|| (Number(swiftVersion[1]) === 6 && Number(swiftVersion[2]) < 2)
) {
	throw new Error("Building native desktop inspection requires Xcode with Swift 6.2 or newer");
}
run([
	"/usr/bin/plutil",
	"-insert",
	"LSMinimumSystemVersion",
	"-string",
	"15.0",
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
	`ACE_IDENTIFIER=${JSON.stringify(identifier)}`,
	"--define",
	`ACE_PROFILE=${JSON.stringify(profile) || "undefined"}`,
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
	"-mmacosx-version-min=15.0",
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
	"-mmacosx-version-min=15.0",
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
run([
	"xcrun",
	"swift",
	"package",
	"--package-path",
	native,
	"--force-resolved-versions",
	"resolve",
]);
const resolved = JSON.parse(readFileSync(join(native, "Package.resolved"), "utf8")) as {
	pins: { identity: string; state: { version: string; revision: string } }[];
};
const checkouts = join(native, ".build", "checkouts");
const dependencies = new Map(readdirSync(checkouts).map((name) => [name.toLowerCase(), name]));
const peekaboo = resolved.pins.find(({ identity }) => identity === "peekaboo");
const revision = "4d43dc9d80cd2aa3787a27f54b76d692db1dcf8f";
if (peekaboo?.state.version !== "4.8.0" || peekaboo.state.revision !== revision) {
	throw new Error("The native patches require Peekaboo 4.8.0 at its pinned revision");
}
const checkout = dependencies.get("peekaboo");
if (!checkout) throw new Error("The resolved Peekaboo checkout is missing");
const git = ["git", "-C", join(checkouts, checkout)];
const head = Bun.spawnSync([...git, "rev-parse", "HEAD"]);
if (!head.success || head.stdout.toString().trim() !== revision) {
	throw new Error(
		`The Peekaboo checkout must be at ${revision} before applying the native patches`,
	);
}
// Build the expected patch stack in a private index: later patches may change earlier patch contexts.
const patches = [
	"peekaboo-click.patch",
	"peekaboo-insert.patch",
	"peekaboo-pointer-window.patch",
	"peekaboo-quit.patch",
	"peekaboo-clipboard-text.patch",
	"peekaboo-close.patch",
	"peekaboo-clipboard-image.patch",
	"peekaboo-launch.patch",
	"peekaboo-clipboard-files.patch",
	"peekaboo-point-focus.patch",
	"peekaboo-clipboard-image-write.patch",
	"peekaboo-menu.patch",
]
	.map((name) => join(native, "patches", name));
const temporary = mkdtempSync(join(tmpdir(), "ace-native-patches-"));
try {
	const env = { ...process.env, GIT_INDEX_FILE: join(temporary, "index") };
	const initial = Bun.spawnSync([...git, "read-tree", "HEAD"], { env });
	if (!initial.success) throw new Error("Cannot read the pinned native tree: " + initial.stderr);
	const isExpected = () => {
		const extra = Bun.spawnSync([...git, "ls-files", "--others", "--exclude-standard"], { env });
		const diff = Bun.spawnSync([...git, "diff", "--quiet", "--"], { env });
		if (!extra.success || (diff.exitCode !== 0 && diff.exitCode !== 1)) {
			throw new Error("Cannot verify the native checkout: " + extra.stderr + "\n" + diff.stderr);
		}
		return !extra.stdout.toString().trim() && diff.success;
	};
	let applied = -1;
	for (let index = 0; index <= patches.length; index++) {
		if (isExpected()) applied = index;
		if (index === patches.length) break;
		const expected = Bun.spawnSync([...git, "apply", "--cached", patches[index]!], { env });
		if (!expected.success) {
			throw new Error("Cannot assemble the pinned native patch stack: " + expected.stderr);
		}
	}
	if (applied < 0) {
		throw new Error(
			"The native checkout differs from every pinned patch prefix. Resolve source drift before building.",
		);
	}
	for (const patch of patches.slice(applied)) run([...git, "apply", patch]);
	if (!isExpected()) throw new Error("The native checkout differs from the pinned patch stack.");
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
const swiftBuild = [
	"xcrun",
	"swift",
	"build",
	"--package-path",
	native,
	"--configuration",
	"release",
	"--force-resolved-versions",
	"-Xlinker",
	"-rpath",
	"-Xlinker",
	"@loader_path/../Frameworks",
];
run(swiftBuild);
const location = Bun.spawnSync([...swiftBuild, "--show-bin-path"]);
if (!location.success) throw new Error("Cannot locate the native desktop build products");
const products = location.stdout.toString().trim();
const binaries = ["libAceDesktop.dylib", "ace-desktop-client"];
for (const name of binaries) copyFileSync(join(products, name), join(bin, name));
// Discover the runtimes from Mach-O dependencies instead of assuming a Swift library list.
run([
	"xcrun",
	"swift-stdlib-tool",
	"--copy",
	"--platform",
	"macosx",
	...binaries.flatMap((name) => ["--scan-executable", join(bin, name)]),
	"--destination",
	frameworks,
]);
for (const { identity } of resolved.pins) {
	const checkout = dependencies.get(identity);
	if (!checkout) throw new Error(`The resolved native dependency ${identity} is missing`);
	const source = join(checkouts, checkout);
	const licenses = readdirSync(source).filter((name) =>
		/^(LICENSE|LICENCE|NOTICE)([.-].*)?$/i.test(name)
	);
	if (!licenses.length) throw new Error(`The native dependency ${identity} has no license file`);
	const destination = join(contents, "Resources", "Licenses", identity);
	mkdirSync(destination, { recursive: true });
	for (const name of licenses) copyFileSync(join(source, name), join(destination, name));
}
run(["/usr/bin/ditto", join(sdk, "Sparkle.framework"), join(frameworks, "Sparkle.framework")]);
run([
	"xcrun",
	"clang",
	"-dynamiclib",
	"-fobjc-arc",
	"-mmacosx-version-min=15.0",
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
