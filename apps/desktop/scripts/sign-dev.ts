import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.env.ELECTROBUN_BUILD_ENV === "dev") {
	const build = process.env.ELECTROBUN_BUILD_DIR;
	if (!build) throw new Error("Run this script through Electrobun");
	const name = readdirSync(build).find((name) => name.endsWith(".app"));
	if (!name) throw new Error("The Ace application bundle is missing");
	const app = join(build, name);
	const bin = join(app, "Contents", "MacOS");
	const identity = process.env.ACE_CODESIGN_IDENTITY || "-";
	// Installed helper updates need a consistent Apple-issued identity across the bundle.
	for (const path of [...readdirSync(bin).map((file) => join(bin, file)), app]) {
		const result = Bun.spawnSync(["codesign", "--force", "--sign", identity, path], {
			stdio: ["ignore", "inherit", "inherit"],
		});
		if (!result.success) throw new Error(`Could not sign ${path} for development`);
	}
}
