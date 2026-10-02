import { GatewayClient } from "@ace/host/gateway-client";

const scheme = location.protocol === "https:" ? "wss:" : "ws:";
export const host = new GatewayClient(
	import.meta.env.VITE_ACE_HOST || `${scheme}//${location.host}/ws`,
);
