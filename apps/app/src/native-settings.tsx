import { useEffect, useState } from "react";

import { Button } from "@ace/ui";
import type { NativeAction, NativeState } from "@ace/desktop/protocol";

type Permission = Extract<NativeAction, { op: "permission" }>["permission"];

const permissions = [
	{ key: "accessibility", label: "Accessibility" },
	{ key: "screenRecording", label: "Screen Recording" },
	{ key: "eventSynthesizing", label: "Keyboard input" },
] as const;

const clipboardPolicies: Record<NativeState["clipboardRead"]["policy"], string> = {
	default: "Use macOS default",
	ask: "Ask",
	always_allow: "Always allow",
	always_deny: "Always deny",
	unavailable_on_this_os: "No macOS grant required",
	unknown: "Unknown",
};

const states: Record<NativeState["state"], string> = {
	stopped: "Not running",
	starting: "Starting…",
	ready: "Ready",
	stopping: "Stopping…",
	error: "Needs attention",
};

export function NativeStatus(
	{ native, refresh }: { native: (action: NativeAction) => Promise<NativeState>; refresh: number },
) {
	const [result, setResult] = useState<{ value?: NativeState; error?: string }>({});
	const [action, setAction] = useState<{ busy?: Permission; error?: string }>({});
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		let active = true;
		let pending = false;
		const check = () => {
			if (document.visibilityState !== "visible" || pending) return;
			pending = true;
			native({ op: "status" }).then(
				(value) => {
					if (active) setResult({ value });
				},
				(error: Error) => {
					if (active) setResult({ error: error.message });
				},
			).finally(() => {
				pending = false;
			});
		};
		check();
		const timer = window.setInterval(check, 3000);
		window.addEventListener("focus", check);
		document.addEventListener("visibilitychange", check);
		return () => {
			active = false;
			window.clearInterval(timer);
			window.removeEventListener("focus", check);
			document.removeEventListener("visibilitychange", check);
		};
	}, [native, refresh, retry]);

	async function grant(permission: Permission) {
		setAction({ busy: permission });
		try {
			const value = await native({ op: "permission", permission });
			setResult({ value });
			setAction(value.error ? { error: value.error } : {});
		} catch (error) {
			setAction({ error: (error as Error).message });
		}
		setRetry(value => value + 1);
	}

	const value = result.value;
	const needsPermission = value?.state === "ready"
		&& (permissions.some(({ key }) => !value[key]) || !value.clipboardRead.readAdmitted);
	const error = action.error || result.error || value?.error;

	return (
		<section className="space-y-2" aria-label="Computer use">
			<h3 className="font-medium">Computer use</h3>
			<p role="status">
				{needsPermission
					? "Permissions needed"
					: value
					? states[value.state]
					: result.error
					? "Could not check computer use"
					: "Checking computer use…"}
			</p>
			<p className="text-muted-foreground">
				Keep Ace open on the host running the channel's tools. For a hosted channel, that is its
				workspace. The channel's collaborator agent setting also applies to computer use.
			</p>
			<div className="space-y-2">
				{permissions.map(({ key, label }) => (
					<div key={key} className="flex items-center justify-between gap-3">
						<p>{label}: {value ? value[key] ? "Granted" : "Not granted" : "Not checked"}</p>
						{!value?.[key] && (
							<Button
								variant="outline"
								disabled={!!action.busy}
								onClick={() => void grant(key)}
							>
								Enable {label}
							</Button>
						)}
					</div>
				))}
				<div className="space-y-1">
					<p>
						Clipboard reading:{" "}
						{value ? clipboardPolicies[value.clipboardRead.policy] : "Not checked"}
					</p>
					{value && !value.clipboardRead.readAdmitted && (
						<p className="text-muted-foreground">
							Allow Ace to read the clipboard in macOS System Settings. Checking this status does
							not read clipboard contents.
						</p>
					)}
				</div>
			</div>
			{action.busy && <p role="status">Requesting permission…</p>}
			{error && <p role="alert" className="text-destructive">{error}</p>}
		</section>
	);
}
