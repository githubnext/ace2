import { dirname, join } from "node:path";

import { dlopen } from "bun:ffi";

import type { helper } from "./helper";
import type { UpdateAction, UpdateState } from "./protocol";

export function updates(control: ReturnType<typeof helper>, version: string, channel: string) {
	const { symbols } = dlopen(join(dirname(process.execPath), "ace-updates.dylib"), {
		ace_updates_start: { args: [], returns: "void" },
		ace_updates_status: { args: [], returns: "cstring" },
		ace_updates_action: { args: ["int"], returns: "bool" },
	});
	let started = false;
	let preparing = false;
	let recovering: Promise<void> | undefined;
	let error: string | undefined;
	let recoveryFailed = false;
	let installing = false;

	function status(): UpdateState {
		if (!started) return { phase: "idle", version, channel, automatic: false, canCancel: false };
		const state = JSON.parse(symbols.ace_updates_status().toString()) as UpdateState;
		return {
			...state,
			version,
			channel,
			...(recovering ? { phase: "recovering" } as const : {}),
			...(error ? { phase: "error", error } as const : {}),
			needsRecovery: recoveryFailed,
		};
	}

	function recover(): Promise<void> {
		if (recovering) return recovering;
		recovering = control.recover().catch((reason: Error) => {
			error = `Could not resume Ace Helper: ${reason.message}`;
			recoveryFailed = true;
			throw reason;
		}).finally(() => {
			recovering = undefined;
			installing = false;
		});
		return recovering;
	}

	const active = new Set(["preparing", "downloading", "installing", "restarting", "recovering"]);
	function busy(): boolean {
		return preparing || !!recovering || control.pending() || active.has(status().phase);
	}

	// Sparkle owns the main thread. Poll snapshots instead of invoking Bun from native callbacks.
	setInterval(() => {
		if (!installing || preparing || recovering || recoveryFailed || !control.pending()) return;
		if (active.has(status().phase)) return;
		void recover().catch(() => {});
	}, 250);

	async function act(action: UpdateAction): Promise<UpdateState> {
		if (action.op === "status") return status();
		if (action.op === "recover") {
			if (!recoveryFailed) throw new Error("Ace Helper does not need recovery");
			error = undefined;
			recoveryFailed = false;
			await recover();
			return status();
		}
		if (preparing || recovering || recoveryFailed) {
			throw new Error("Wait for Ace Helper to finish changing state");
		}
		error = undefined;
		if (action.op === "install") {
			if (!symbols.ace_updates_action(1)) throw new Error("Check for an update before installing");
			preparing = true;
			installing = true;
			try {
				await control.prepare();
				if (!symbols.ace_updates_action(2)) throw new Error("The update is no longer available");
			} catch (reason) {
				symbols.ace_updates_action(3);
				error = (reason as Error).message;
				await recover();
			} finally {
				preparing = false;
			}
		} else {
			const command = action.op === "check"
				? 0
				: action.op === "cancel"
				? 3
				: action.op === "automatic" && action.value
				? 5
				: 4;
			if (!symbols.ace_updates_action(command)) {
				throw new Error("That update action is not available right now");
			}
			if (action.op === "cancel") await recover();
		}
		return status();
	}

	return {
		status,
		act,
		busy,
		start() {
			if (started) return;
			// Initialize after the first window's AppKit setup.
			symbols.ace_updates_start();
			started = true;
		},
	};
}
