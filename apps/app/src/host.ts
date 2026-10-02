import { GatewayClient } from "@ace/host/gateway-client";

declare global {
	interface Window {
		__ACE_TOKEN__?: string;
	}
}

const fragment = new URLSearchParams(location.hash.slice(1));
const token = window.__ACE_TOKEN__ || fragment.get("token") || undefined;
delete window.__ACE_TOKEN__;
if (fragment.has("token")) {
	fragment.delete("token");
	history.replaceState(
		null,
		"",
		`${location.pathname}${location.search}${fragment.size ? `#${fragment}` : ""}`,
	);
}

const scheme = location.protocol === "https:" ? "wss:" : "ws:";
export const host = new GatewayClient(
	import.meta.env.VITE_ACE_HOST || `${scheme}//${location.host}/ws`,
	token,
);
