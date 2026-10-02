import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

function run(command: string[]): void {
	const result = Bun.spawnSync(command, { stdio: ["ignore", "inherit", "inherit"] });
	if (!result.success) throw new Error(`${command[0]} failed with exit code ${result.exitCode}`);
}

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

const agents = join(contents, "Library", "LaunchAgents");
mkdirSync(agents, { recursive: true });
writeFileSync(
	join(agents, `${identifier}.helper.plist`),
	readFileSync(join(native, "helper.plist"), "utf8").replaceAll("dev.ace.desktop", identifier),
);
