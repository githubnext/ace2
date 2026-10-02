import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { dlopen } from "bun:ffi";

const { symbols } = dlopen(join(dirname(process.execPath), "ace-service.dylib"), {
	ace_helper_status: { args: ["cstring"], returns: "int" },
	ace_helper_register: { args: ["cstring"], returns: "cstring" },
	ace_helper_unregister: { args: ["cstring"], returns: "cstring" },
	ace_helper_settings: { args: [], returns: "void" },
});

export function service(identifier: string) {
	const file = `${identifier}.helper.plist`;
	const plist = Buffer.from(`${file}\0`);
	return {
		status() {
			if (!existsSync(join(dirname(process.execPath), "..", "Library", "LaunchAgents", file))) {
				throw new Error("Ace Helper is missing from this application");
			}
			// macOS can report NotFound before the first registration of a bundled agent.
			return (["unregistered", "enabled", "approval", "unregistered"] as const)[
				symbols.ace_helper_status(plist)
			];
		},
		register() {
			const error = symbols.ace_helper_register(plist).toString();
			if (error) throw new Error(`Could not enable Ace Helper: ${error}`);
		},
		unregister() {
			const error = symbols.ace_helper_unregister(plist).toString();
			if (error) throw new Error(`Could not disable Ace Helper: ${error}`);
		},
		settings: () => symbols.ace_helper_settings(),
	};
}
