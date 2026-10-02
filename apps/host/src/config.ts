import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const settings = process.platform === "darwin"
	? join(homedir(), "Library", "Application Support", "Ace")
	: join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "ace");

/** Capture host configuration before credentials leave the process environment. */
export const config = {
	home: resolve(process.env.ACE_HOME || join(homedir(), ".local", "state", "ace")),
	settings: resolve(process.env.ACE_CONFIG_HOME || settings),
	keychain: process.env.ACE_KEYCHAIN_SERVICE || "ace",
	user: process.env.ACE_USER,
	model: process.env.ACE_MODEL,
	port: Number(process.env.ACE_PORT || 4140),
	peerPort: process.env.ACE_PEER_PORT ? Number(process.env.ACE_PEER_PORT) : undefined,
	app: process.env.ACE_APP_DIR || fileURLToPath(new URL("../../app/dist", import.meta.url)),
	appUrl: process.env.ACE_APP_URL,
	worker: [
		process.execPath,
		"--no-env-file",
		process.env.ACE_WORKER || fileURLToPath(new URL("./worker.ts", import.meta.url)),
	] as [string, ...string[]],
};

/** Development apps must not take over an installed app's channels or listener. */
export function desktop(channel: string): void {
	if (channel === "stable") return;
	if (!process.env.ACE_HOME) config.home = join(homedir(), ".local", "state", `ace-${channel}`);
	if (!process.env.ACE_CONFIG_HOME) config.settings = `${settings}-${channel}`;
	if (!process.env.ACE_KEYCHAIN_SERVICE) config.keychain = `ace-${channel}`;
	if (!process.env.ACE_PORT) config.port = channel === "dev" ? 4141 : 4142;
}
