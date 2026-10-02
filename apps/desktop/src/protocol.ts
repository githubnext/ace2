export type HelperState = {
	service: "unregistered" | "enabled" | "approval";
	running: boolean;
	managed: boolean;
};

export type HelperAction = "status" | "start" | "stop" | "restart" | "settings" | "log";

/** Native actions are separate from the host and never available to tailnet peers. */
export type DesktopRPC = {
	bun: {
		requests: {
			project: { params: { token: string }; response: string | null };
			helper: { params: { token: string; action: HelperAction }; response: HelperState };
		};
		messages: {};
	};
	webview: { requests: {}; messages: {} };
};
