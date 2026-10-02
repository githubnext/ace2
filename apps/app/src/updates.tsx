import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";

import { Button, toast } from "@ace/ui";
import type { UpdateAction, UpdateState } from "@ace/desktop/protocol";

import { desktop } from "./desktop";

let state: UpdateState | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let polling = false;
const listeners = new Set<() => void>();

function publish(value: UpdateState) {
	if (JSON.stringify(value) === JSON.stringify(state)) return;
	state = value;
	for (const listener of listeners) listener();
}

async function poll() {
	polling = true;
	try {
		if (desktop) publish(await desktop.updates({ op: "status" }));
	} finally {
		polling = false;
		if (listeners.size) timer = setTimeout(() => void poll().catch(() => {}), 1000);
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (listeners.size === 1 && !polling) void poll().catch(() => {});
	return () => {
		listeners.delete(listener);
		if (!listeners.size) clearTimeout(timer);
	};
}

function useUpdates() {
	return useSyncExternalStore(subscribe, () => state);
}

export function UpdateNotice({ onOpen }: { onOpen: () => void }) {
	const update = useUpdates();
	const open = useEffectEvent(onOpen);
	useEffect(() => {
		if (update?.phase !== "available") return;
		toast(`Ace ${update.available} is available`, {
			id: "ace-update",
			action: { label: "View update", onClick: () => open() },
			duration: Infinity,
			closeButton: true,
		});
		return () => void toast.dismiss("ace-update");
	}, [update?.phase, update?.available]);
	return null;
}

const labels: Record<UpdateState["phase"], string> = {
	disabled: "Updates are disabled in development builds.",
	idle: "Ace is up to date.",
	checking: "Checking for updates…",
	available: "An update is ready to download.",
	preparing: "Pausing Ace Helper and saving work…",
	downloading: "Downloading the update…",
	installing: "Verifying and installing the update…",
	restarting: "Restarting Ace…",
	recovering: "Resuming Ace Helper…",
	error: "The update could not finish.",
};

export function UpdateSettings() {
	const update = useUpdates();
	const [error, setError] = useState<string | undefined>(undefined);
	const [acting, setActing] = useState(false);

	async function act(action: UpdateAction) {
		if (!desktop) return;
		setActing(true);
		setError(undefined);
		try {
			publish(await desktop.updates(action));
		} catch (reason) {
			setError((reason as Error).message);
		} finally {
			setActing(false);
		}
	}

	if (!update) return <p role="status">Reading update settings…</p>;
	const disabled = update.phase === "disabled";
	return (
		<section className="space-y-4 text-xs" aria-label="App updates">
			<div>
				<h3 className="font-medium">Ace {update.version}</h3>
				<p className="text-muted-foreground">
					{update.channel === "stable"
						? "Stable releases"
						: update.channel === "canary"
						? "Canary releases"
						: "Development build"}
				</p>
			</div>
			<p role="status">
				{update.phase === "available"
					? `Ace ${update.available} is available.`
					: update.phase === "idle" && !update.checked
					? "Check for a new version of Ace."
					: labels[update.phase]}
			</p>
			{update.phase === "downloading" && (
				<progress
					className="h-1 w-full"
					max={1}
					value={update.progress}
					aria-label="Downloading update"
				/>
			)}
			{!disabled && (
				<>
					<p className="text-muted-foreground">
						Ace Helper pauses while an update downloads and installs. Unfinished runs resume after
						restart; terminal shells close. Your projects, history, and provider keys stay on this
						Mac.
					</p>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={update.automatic}
							disabled={acting || update.needsRecovery}
							onChange={(event) => void act({ op: "automatic", value: event.target.checked })}
						/>
						Automatically check for updates
					</label>
					<div className="flex flex-wrap gap-2">
						{update.needsRecovery
							? (
								<Button disabled={acting} onClick={() => void act({ op: "recover" })}>
									Resume Ace Helper
								</Button>
							)
							: update.phase === "available"
							? (
								<Button disabled={acting} onClick={() => void act({ op: "install" })}>
									Install and Restart
								</Button>
							)
							: (
								<Button
									variant="outline"
									disabled={acting || !["idle", "error"].includes(update.phase)}
									onClick={() => void act({ op: "check" })}
								>
									Check for Updates
								</Button>
							)}
						{update.canCancel && (
							<Button
								variant="ghost"
								disabled={acting}
								onClick={() => void act({ op: "cancel" })}
							>
								Cancel
							</Button>
						)}
					</div>
					{update.checked && (
						<p className="text-muted-foreground">
							Last checked {new Date(update.checked).toLocaleString()}
						</p>
					)}
				</>
			)}
			{(error || update.error) && (
				<p role="alert" className="text-destructive">{error || update.error}</p>
			)}
		</section>
	);
}
