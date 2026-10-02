/** Builds what the desktop app carries besides its main process: the web app and the channel worker. */
import { rmSync } from "node:fs";

const root = new URL("../../..", import.meta.url).pathname;
const out = new URL("../stage", import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });

const app = Bun.spawnSync(["bun", "run", "build"], {
	cwd: `${root}/apps/app`,
	stdio: ["inherit", "inherit", "inherit"],
});
if (!app.success) process.exit(1);

const worker = await Bun.build({
	entrypoints: [`${root}/apps/host/src/worker.ts`],
	outdir: `${out}/worker`,
	target: "bun",
});
if (!worker.success) {
	for (const log of worker.logs) console.error(log);
	process.exit(1);
}
