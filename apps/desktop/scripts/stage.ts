/** Build the web app before Electrobun packages its native processes. */
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));

const app = Bun.spawnSync([process.execPath, "run", "build"], {
	cwd: `${root}/apps/app`,
	stdio: ["inherit", "inherit", "inherit"],
});
if (!app.success) process.exit(1);
