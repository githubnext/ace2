import { dirname, join } from "node:path";

import { CString, dlopen } from "bun:ffi";

import { config } from "@ace/host/config";

import type { NativeAction, NativeState } from "./protocol";

export function native(identifier: string) {
	const { symbols } = dlopen(join(dirname(process.execPath), "libAceDesktop.dylib"), {
		ace_desktop_start: { args: ["cstring", "cstring"], returns: "void" },
		ace_desktop_status: { args: [], returns: "ptr" },
		ace_desktop_stop: { args: [], returns: "void" },
		ace_desktop_free: { args: ["ptr"], returns: "void" },
		ace_desktop_permission: { args: ["cstring"], returns: "void" },
	});

	function status(): NativeState {
		const pointer = symbols.ace_desktop_status();
		if (!pointer) throw new Error("Could not read native inspection status");
		try {
			return JSON.parse(new CString(pointer).toString()) as NativeState;
		} finally {
			symbols.ace_desktop_free(pointer);
		}
	}

	return {
		status,
		start() {
			symbols.ace_desktop_start(
				Buffer.from(`${join(config.home, "desktop.sock")}\0`),
				Buffer.from(`${identifier}.desktop-client\0`),
			);
		},
		act(action: NativeAction): NativeState {
			if (action.op === "permission") {
				if (!["accessibility", "screenRecording"].includes(action.permission)) {
					throw new Error("Unknown native inspection permission");
				}
				symbols.ace_desktop_permission(Buffer.from(`${action.permission}\0`));
			}
			return status();
		},
		async stop(): Promise<void> {
			if (status().state === "stopped") return;
			symbols.ace_desktop_stop();
			// Keep the library loaded while its bridge drains outstanding observations.
			const deadline = Date.now() + 30_000;
			while (status().state !== "stopped") {
				if (Date.now() > deadline) throw new Error("Native inspection did not stop in time");
				await Bun.sleep(50);
			}
		},
	};
}
