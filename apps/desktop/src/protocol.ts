export type HelperState = {
	service: "unregistered" | "enabled" | "approval";
	running: boolean;
	managed: boolean;
};

export type HelperAction = "status" | "start" | "stop" | "restart" | "settings" | "log";

export type UpdateState = {
	phase:
		| "disabled"
		| "idle"
		| "checking"
		| "available"
		| "preparing"
		| "downloading"
		| "installing"
		| "restarting"
		| "recovering"
		| "error";
	version: string;
	channel: string;
	automatic: boolean;
	canCancel: boolean;
	available?: string;
	checked?: number;
	progress?: number;
	error?: string;
	needsRecovery?: boolean;
};

export type UpdateAction =
	| { op: "status" | "check" | "install" | "cancel" | "recover" }
	| { op: "automatic"; value: boolean };

/** Native actions are separate from the host and never available to tailnet peers. */
export type DesktopRPC = {
	bun: {
		requests: {
			project: { params: { token: string }; response: string | null };
			lights: { params: { token: string; expanded: boolean }; response: null };
			zoom: { params: { token: string }; response: null };
			helper: { params: { token: string; action: HelperAction }; response: HelperState };
			updates: { params: { token: string; action: UpdateAction }; response: UpdateState };
		};
		messages: {};
	};
	webview: { requests: {}; messages: {} };
};
