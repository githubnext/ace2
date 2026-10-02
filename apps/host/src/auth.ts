import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "./config";
import type { HostInfo } from "./protocol";

/** The desktop and CLI prove ownership without putting provider keys in the webview. */
export function token(): string {
	const path = join(config.home, "host.token");
	mkdirSync(config.home, { recursive: true, mode: 0o700 });
	try {
		writeFileSync(path, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	const stat = statSync(path);
	if (stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) {
		throw new Error("Ace's host token must belong to you and be readable only by you");
	}
	const value = readFileSync(path, "utf8");
	if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Ace's host token is invalid");
	return value;
}

export function appUrl(port = config.port): URL {
	const url = new URL(config.appUrl || `http://127.0.0.1:${port}`);
	if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
		throw new Error("Ace's app URL must use HTTP on localhost or 127.0.0.1");
	}
	return url;
}

/** Bind discovery to this owner, listener, and process before the UI loads its web content. */
export function proof(info: HostInfo, challenge: string, port: number, secret: string): string {
	return createHmac("sha256", secret)
		.update(
			JSON.stringify([info.app, info.protocol, info.home, info.pid, info.helper, port, challenge]),
		)
		.digest("hex");
}

export function owner(port: number) {
	const secret = token();
	const cookie = `ace-${port}`;
	const origins = new Set([
		`http://127.0.0.1:${port}`,
		`http://localhost:${port}`,
		appUrl(port).origin,
	]);
	return {
		proof: (info: HostInfo, challenge: string) => proof(info, challenge, port, secret),
		accepts(request: Request): boolean {
			const host = request.headers.get("host");
			if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
			const origin = request.headers.get("origin");
			return origin === null || origins.has(origin);
		},
		authorizes(request: Request): boolean {
			const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "")
				|| request.headers.get("sec-websocket-protocol")?.split(",")
					.map((part) => part.trim()).find((part) => part.startsWith("ace-token."))?.slice(10)
				|| new Bun.CookieMap(request.headers.get("cookie") || "").get(cookie);
			if (!supplied || !/^[a-f0-9]{64}$/.test(supplied)) return false;
			return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
		},
		cookie: `${cookie}=${secret}; HttpOnly; SameSite=Strict; Path=/`,
	};
}
