import { dirname, join } from "node:path";

import type { Desktop } from "@ace/channel/desktop";
import { createDesktop, type DesktopClient } from "@githubnext/desktop-tools";

import { config } from "./config";

let client: DesktopClient | undefined;

export const desktop: Desktop = async (request, context) => {
	client ??= createDesktop({
		client: process.env.ACE_DESKTOP_CLIENT || join(dirname(process.execPath), "ace-desktop-client"),
		socket: join(config.home, "desktop.sock"),
		name: "Ace",
	});
	// Hosted links and pi rows carry only the bounded text and image, not the parsed copy.
	const { text, image, outcome, isError } = await client(request, context.abortSignal);
	return {
		text,
		...(image ? { image } : {}),
		...(outcome ? { outcome } : {}),
		...(isError === undefined ? {} : { isError }),
	};
};
