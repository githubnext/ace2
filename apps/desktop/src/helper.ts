import { join } from "node:path";

import { Utils } from "electrobun/bun";

import { config } from "@ace/host/config";
import { health } from "@ace/host/health";

import type { HelperAction, HelperState } from "./protocol";
import { service } from "./service";

async function wait(check: () => Promise<boolean>, message: string): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (await check()) return;
		await Bun.sleep(100);
	}
	throw new Error(message);
}

async function exited(pid: number): Promise<void> {
	await wait(async () => {
		try {
			process.kill(pid, 0);
			return false;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
			throw error;
		}
	}, "Ace Helper is still shutting down. Check its log before trying again.");
}

export function helper(identifier: string) {
	const agent = service(identifier);
	let changing = false;

	async function info() {
		const found = await health(config.port);
		if (found && found.home !== config.home) {
			throw new Error(
				`Port ${config.port} belongs to an Ace host using a different data directory`,
			);
		}
		return found;
	}

	async function status(): Promise<HelperState> {
		const found = await info();
		return { service: agent.status(), running: !!found, managed: !!found?.helper };
	}

	async function start(): Promise<void> {
		if (agent.status() === "unregistered") agent.register();
		if (agent.status() === "approval") {
			agent.settings();
			throw new Error("Allow Ace in macOS Login Items, then start Ace Helper again.");
		}
		const child = Bun.spawn([
			"/bin/launchctl",
			"kickstart",
			`gui/${process.getuid!()}/${identifier}.helper`,
		], { stdout: "ignore", stderr: "ignore" });
		if (await child.exited !== 0) {
			throw new Error("Could not start Ace Helper. Check macOS Login Items.");
		}
		await wait(async () => {
			const found = await info();
			if (found && !found.helper) throw new Error("This port is in use by a command-line host.");
			return !!found;
		}, `Ace Helper did not start. See ${join(config.home, "helper.log")}`);
	}

	async function act(action: HelperAction): Promise<HelperState> {
		if (action === "status") return status();
		if (action === "settings") {
			agent.settings();
			return status();
		}
		if (action === "log") {
			Utils.showItemInFolder(join(config.home, "helper.log"));
			return status();
		}
		if (changing) throw new Error("Ace Helper is already changing state. Wait for it to finish.");
		changing = true;
		try {
			const found = await info();
			if (found && !found.helper) {
				throw new Error(
					"Ace is connected to a command-line host. Stop ace serve before managing Ace Helper.",
				);
			}
			if (action === "stop") {
				if (agent.status() !== "unregistered") agent.unregister();
				if (found) await exited(found.pid);
			} else if (action === "restart") {
				if (!found) throw new Error("Start Ace Helper before restarting it.");
				process.kill(found.pid, "SIGTERM");
				await exited(found.pid);
				await start();
			} else if (action === "start") {
				if (!found) await start();
			} else {
				throw new Error("Unknown Ace Helper action");
			}
			return await status();
		} finally {
			changing = false;
		}
	}

	return { status, act };
}
