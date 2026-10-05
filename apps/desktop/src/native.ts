import { dirname, join } from "node:path";

import { CString, dlopen, type Pointer } from "bun:ffi";

import { config } from "@ace/host/config";

import type { NativeAction, NativeState } from "./protocol";

export function native(identifier: string) {
	const { symbols } = dlopen(join(dirname(process.execPath), "libAceDesktop.dylib"), {
		ace_desktop_start: { args: ["cstring", "cstring"], returns: "void" },
		ace_desktop_status: { args: [], returns: "ptr" },
		ace_desktop_stop: { args: [], returns: "void" },
		ace_desktop_free: { args: ["ptr"], returns: "void" },
		ace_desktop_permission: { args: ["cstring"], returns: "void" },
		ace_desktop_project_start: { args: ["cstring"], returns: "void" },
		ace_desktop_project_status: { args: [], returns: "ptr" },
	});
	let picker: Promise<string | null> | undefined;

	function read<T>(pointer: Pointer | null): T {
		if (!pointer) throw new Error("Could not read native desktop response");
		try {
			return JSON.parse(new CString(pointer).toString()) as T;
		} finally {
			symbols.ace_desktop_free(pointer);
		}
	}

	function status(): NativeState {
		return read(symbols.ace_desktop_status());
	}

	async function project(path: string): Promise<string | null> {
		symbols.ace_desktop_project_start(Buffer.from(`${path}\0`));
		while (true) {
			const result = read<{ pending: boolean; path: string | null; error?: string }>(
				symbols.ace_desktop_project_status(),
			);
			if (result.error) throw new Error(result.error);
			if (!result.pending) return result.path;
			await Bun.sleep(50);
		}
	}

	return {
		status,
		project(path: string): Promise<string | null> {
			if (picker) return picker;
			picker = project(path).finally(() => picker = undefined);
			return picker;
		},
		start() {
			symbols.ace_desktop_start(
				Buffer.from(`${join(config.home, "desktop.sock")}\0`),
				Buffer.from(`${identifier}.desktop-client\0`),
			);
		},
		act(action: NativeAction): NativeState {
			if (action.op === "permission") {
				if (
					!["accessibility", "screenRecording", "eventSynthesizing"].includes(action.permission)
				) {
					throw new Error("Unknown native desktop permission");
				}
				symbols.ace_desktop_permission(Buffer.from(`${action.permission}\0`));
			}
			return status();
		},
		async stop(): Promise<void> {
			if (status().state === "stopped") return;
			symbols.ace_desktop_stop();
			// Keep the library loaded while its bridge drains outstanding native operations.
			const deadline = Date.now() + 30_000;
			while (status().state !== "stopped") {
				if (Date.now() > deadline) throw new Error("Native desktop tools did not stop in time");
				await Bun.sleep(50);
			}
		},
	};
}
