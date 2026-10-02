import { readdirSync } from "node:fs";
import { join } from "node:path";

import { sign } from "./sign";

if (process.env.ELECTROBUN_BUILD_ENV === "dev") {
	const build = process.env.ELECTROBUN_BUILD_DIR;
	if (!build) throw new Error("Run this script through Electrobun");
	const name = readdirSync(build).find((name) => name.endsWith(".app"));
	if (!name) throw new Error("The Ace application bundle is missing");
	const app = join(build, name);
	const identity = process.env.ACE_CODESIGN_IDENTITY || "-";
	sign(app, identity);
}
