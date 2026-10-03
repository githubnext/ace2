import type { ElectrobunConfig } from "electrobun";

import { version } from "./package.json";

const channel = process.env.ACE_BUILD_CHANNEL || "dev";

export default {
	app: {
		name: "Ace",
		identifier: channel === "stable" ? "dev.ace.desktop" : `dev.ace.desktop.${channel}`,
		version,
	},
	build: {
		// Electrobun's bundled runtime matches its native FFI; Ace Helper carries its own Bun.
		bun: { entrypoint: "src/index.ts" },
		copy: {
			"../app/dist": "web",
		},
		buildFolder: "dist",
		artifactFolder: "artifacts",
		// Release packaging signs the real app; Electrobun's self-extracting wrapper is unused.
		mac: {
			icons: channel === "canary" ? "icons/canary.iconset" : "icons/ace.iconset",
			codesign: false,
			notarize: false,
			createDmg: false,
		},
	},
	release: { generatePatch: false },
	runtime: { exitOnLastWindowClosed: false },
	scripts: { postBuild: "scripts/helper.ts", postPackage: "scripts/sign-dev.ts" },
} satisfies ElectrobunConfig;
