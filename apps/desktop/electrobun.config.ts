import type { ElectrobunConfig } from "electrobun";

import { version } from "./package.json";

export default {
	app: {
		name: "Ace",
		identifier: "dev.ace.desktop",
		version,
	},
	build: {
		// Channels store their state with node:sqlite, which needs Bun 1.4.
		bunVersion: "1.4.0",
		bun: { entrypoint: "src/index.ts" },
		copy: {
			"../app/dist": "web",
			"stage/worker": "worker",
		},
		buildFolder: "dist",
		artifactFolder: "artifacts",
	},
} satisfies ElectrobunConfig;
