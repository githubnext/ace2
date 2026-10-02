import type { ElectrobunConfig } from "electrobun";

import { version } from "./package.json";

export default {
	app: {
		name: "Ace",
		identifier: "dev.ace.desktop",
		version,
	},
	build: {
		bun: { entrypoint: "src/index.ts" },
		buildFolder: "dist",
		artifactFolder: "artifacts",
	},
} satisfies ElectrobunConfig;
