import { GatewayClient } from "@ace/host/gateway-client";

declare global {
	interface Window {
		__ACE_TOKEN__?: string;
		__ACE_DESKTOP__?: boolean;
	}
}

const fragment = new URLSearchParams(location.hash.slice(1));
export const nativeToken = window.__ACE_DESKTOP__ ? window.__ACE_TOKEN__ : undefined;
const token = window.__ACE_TOKEN__ || fragment.get("token") || undefined;
delete window.__ACE_TOKEN__;
delete window.__ACE_DESKTOP__;
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

const opens = new Set<() => void>();
host.onOpen = () => {
	for (const open of opens) open();
};

/** Runs after every host connect, so each view can re-establish its own watches. */
export function onOpen(listener: () => void) {
	opens.add(listener);
	return () => void opens.delete(listener);
}
