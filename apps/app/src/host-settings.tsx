import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@ace/ui";
import type { HelperAction, HelperState } from "@ace/desktop/protocol";
import type { Diagnostics } from "@ace/host/protocol";

import { desktop } from "./desktop";
import { host } from "./host";

const tailnet = {
	missing: "Tailscale is not installed",
	offline: "Tailscale is disconnected",
	running: "Tailscale is connected",
	error: "Tailscale could not be checked",
};

export function HostStatus() {
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const [retry, setRetry] = useState(0);
	const [checks, setChecks] = useState<{ value?: Diagnostics; error?: string }>({});
	const [helper, setHelper] = useState<{ value?: HelperState; error?: string }>({});
	const [action, setAction] = useState<{ busy?: HelperAction; error?: string }>({});
	const [confirm, setConfirm] = useState(false);

	useEffect(() => {
		let active = true;
		if (desktop) {
			desktop.helper("status").then(
				(value) => {
					if (active) setHelper({ value });
				},
				(error: Error) => {
					if (active) setHelper({ error: error.message });
				},
			);
		}
		if (status === "open") {
			host.request<Diagnostics>({ op: "diagnostics" }).then(
				(value) => {
					if (active) setChecks({ value });
				},
				(error: Error) => {
					if (active) setChecks({ error: error.message });
				},
			);
		}
		return () => {
			active = false;
		};
	}, [status, retry]);

	async function control(command: HelperAction) {
		if (!desktop) return;
		setAction({ busy: command });
		setConfirm(false);
		try {
			setHelper({ value: await desktop.helper(command) });
			setAction({});
			setRetry((value) => value + 1);
		} catch (error) {
			setAction({ error: (error as Error).message });
		}
	}

	const current = helper.value;
	const terminal = current?.running && !current.managed;
	const available = !!current && !terminal && !action.busy;

	return (
		<div className="space-y-5 text-xs">
			{desktop && (
				<section className="space-y-2" aria-label="Ace Helper">
					<h3 className="font-medium">Ace Helper</h3>
					<p role="status">
						{terminal
							? "Using a command-line host"
							: current?.running
							? "Running in the background"
							: current?.service === "approval"
							? "macOS approval required"
							: current
							? "Stopped"
							: "Checking Ace Helper…"}
					</p>
					<p className="text-muted-foreground">
						{terminal
							? "Stop ace serve before managing Ace Helper here."
							: "Ace Helper starts at login and keeps channels available after you quit Ace."}
					</p>
					<div className="flex flex-wrap gap-2">
						{!current?.running
							? (
								<Button disabled={!available} onClick={() => void control("start")}>
									Start Ace Helper
								</Button>
							)
							: (
								<>
									<Button
										variant="outline"
										disabled={!available}
										onClick={() => void control("restart")}
									>
										Restart Ace Helper
									</Button>
									<Button variant="outline" disabled={!available} onClick={() => setConfirm(true)}>
										Stop Ace Helper…
									</Button>
								</>
							)}
					</div>
					{confirm && (
						<div className="space-y-2 rounded-md border p-3">
							<p>
								This host's channels and tools will go offline. Work resumes when you start Ace
								Helper and reopen a channel. Background hosting will stay off until you enable it
								again.
							</p>
							<div className="flex gap-2">
								<Button variant="destructive" onClick={() => void control("stop")}>
									Stop Ace Helper
								</Button>
								<Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
							</div>
						</div>
					)}
					{action.busy && <p role="status">Updating Ace Helper…</p>}
					{(action.error || helper.error) && (
						<p role="alert" className="text-destructive">{action.error || helper.error}</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="ghost"
							disabled={!!action.busy}
							onClick={() => void control("settings")}
						>
							macOS Login Items
						</Button>
						<Button variant="ghost" disabled={!!action.busy} onClick={() => void control("log")}>
							Show helper log
						</Button>
					</div>
				</section>
			)}
			{status !== "open"
				? <p role="status">Connect to Ace Helper to check tools and team connectivity.</p>
				: checks.value
				? (
					<>
						<section className="space-y-2" aria-label="Tools">
							<h3 className="font-medium">Tools</h3>
							{checks.value.tools.map((tool) => (
								<div key={tool.name}>
									<p>{tool.name}: {tool.error ? "Needs attention" : tool.version || "Available"}</p>
									{tool.path && <p className="break-all text-muted-foreground">{tool.path}</p>}
									{tool.error && <p className="text-destructive">{tool.error}</p>}
								</div>
							))}
						</section>
						<section className="space-y-2" aria-label="Team connectivity">
							<h3 className="font-medium">Team connectivity</h3>
							<p>
								{tailnet[checks.value.tailscale.state]}
								{checks.value.tailscale.name && ` as ${checks.value.tailscale.name}`}
							</p>
							{checks.value.tailscale.error && (
								<p className="text-destructive">{checks.value.tailscale.error}</p>
							)}
							<p className="text-muted-foreground">
								Tailscale lets teammates reach this host. Restart Ace Helper after connecting or
								changing Tailscale.
							</p>
							<p>Team directory: {checks.value.directory.url || "Not configured"}</p>
							{checks.value.directory.error
								? <p className="text-destructive">{checks.value.directory.error}</p>
								: checks.value.directory.url && (
									<p className="text-muted-foreground">
										{checks.value.directory.synced
											? `Last synced ${
												new Date(checks.value.directory.synced).toLocaleTimeString()
											}`
											: "Waiting for the first sync…"}
									</p>
								)}
						</section>
					</>
				)
				: !checks.error && <p role="status">Checking this host…</p>}
			{checks.error && status === "open" && (
				<p role="alert" className="text-destructive">{checks.error}</p>
			)}
			<div className="flex justify-end">
				<Button
					variant="ghost"
					disabled={!!action.busy}
					onClick={() => setRetry((value) => value + 1)}
				>
					Refresh status
				</Button>
			</div>
		</div>
	);
}
