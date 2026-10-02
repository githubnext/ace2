import type { Env } from "./object";

export { HostedChannel } from "./object";

const ROUTE = /^\/channels\/([a-z0-9-]{1,64})(\/workspace)?$/;

/**
 * Hosts are trusted to state who wrote each message: they verify their own users over the tailnet
 * and hold the team's secret. A deployment without `ACE_SECRET` refuses everything.
 */
function authorized(request: Request, env: Env): boolean {
	const encoder = new TextEncoder();
	const given = encoder.encode(request.headers.get("authorization") ?? "");
	const expected = encoder.encode(`Bearer ${env.ACE_SECRET}`);
	return !!env.ACE_SECRET && given.byteLength === expected.byteLength
		&& crypto.subtle.timingSafeEqual(given, expected);
}

export default {
	async fetch(request, env) {
		const match = ROUTE.exec(new URL(request.url).pathname);
		if (!match) return new Response("Not found", { status: 404 });
		if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 });
		return env.CHANNEL.get(env.CHANNEL.idFromName(match[1])).fetch(request);
	},
} satisfies ExportedHandler<Env>;
