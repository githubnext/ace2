import { dirname, join } from "node:path";

import { dlopen } from "bun:ffi";

const { symbols } = dlopen(join(dirname(process.execPath), "ace-window.dylib"), {
	ace_window_setup: { args: ["ptr"], returns: "void" },
	ace_window_lights: { args: ["ptr", "bool"], returns: "void" },
	ace_window_zoom: { args: ["ptr"], returns: "void" },
});

export const windowStyle = {
	setup: symbols.ace_window_setup,
	lights: symbols.ace_window_lights,
	zoom: symbols.ace_window_zoom,
};
