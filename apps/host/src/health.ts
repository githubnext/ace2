import { randomBytes, timingSafeEqual } from "node:crypto";

import { proof, token } from "./auth";
import { HOST_PROTOCOL, type HostInfo } from "./protocol";

/** A port occupied by another program must not be mistaken for Ace Helper. */
export async function health(port: number): Promise<HostInfo | undefined> {
	const url = `http://127.0.0.1:${port}/health`;
	const challenge = randomBytes(32).toString("hex");
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { "x-ace-challenge": challenge },
			signal: AbortSignal.timeout(1000),
			redirect: "error",
		});
	} catch {
		return;
	}
	const info = await response.json().catch(() => null) as Partial<HostInfo> | null;
	if (
		!response.ok || info?.app !== "ace" || typeof info.home !== "string"
		|| typeof info.pid !== "number"
	) {
		throw new Error(`Port ${port} is occupied by a service other than Ace Helper`);
	}
	if (info.protocol !== HOST_PROTOCOL) {
		throw new Error(`Ace Helper on port ${port} uses an incompatible protocol; restart it`);
	}
	const received = response.headers.get("x-ace-proof");
	if (!received || !/^[a-f0-9]{64}$/.test(received)) {
		throw new Error("Ace Helper could not authenticate itself. Restart it before opening Ace.");
	}
	const expected = proof(info as HostInfo, challenge, port, token());
	if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
		throw new Error("This listener does not belong to your Ace Helper");
	}
	return info as HostInfo;
}
