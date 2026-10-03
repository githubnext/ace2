import { useEffect, useState, useSyncExternalStore } from "react";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Field,
	FieldLabel,
	Input,
} from "@ace/ui";
import type { ProviderSettings, Settings as HostSettings } from "@ace/host/protocol";

import { host } from "./host";
import { desktop } from "./desktop";
import { HostStatus } from "./host-settings";
import { UpdateSettings } from "./updates";

const sources = {
	keychain: "Saved in Keychain",
	environment: "Using an environment key",
	missing: "No key added",
	unavailable: "Keychain access needed",
};

function Provider({ provider, disabled }: { provider: ProviderSettings; disabled: boolean }) {
	const [value, setValue] = useState("");
	const [confirm, setConfirm] = useState(false);
	const [action, setAction] = useState<{ busy?: boolean; error?: string; message?: string }>({});
	const id = `key-${provider.id}`;

	async function run(op: "key-set" | "key-check" | "key-remove") {
		setAction({ busy: true });
		try {
			await host.request(
				op === "key-set"
					? { op, provider: provider.id, value }
					: { op, provider: provider.id },
			);
			if (op === "key-set") setValue("");
			setConfirm(false);
			setAction({
				message: op === "key-check"
					? "Connection verified."
					: op === "key-remove"
					? "Saved key removed."
					: "Key checked and saved.",
			});
		} catch (error) {
			setAction({ error: (error as Error).message });
		}
	}

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void run("key-set");
			}}
		>
			<fieldset
				className="flex flex-col gap-3 rounded-lg border p-3"
				disabled={disabled || action.busy}
			>
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-medium">{provider.name}</h3>
					<span className="text-muted-foreground">{sources[provider.source]}</span>
				</div>
				{provider.override && (
					<p className="text-muted-foreground">
						{provider.override}{" "}
						takes priority over a saved key. Remove that environment override and restart Ace Helper
						to use Keychain.
					</p>
				)}
				{provider.error && <p role="alert" className="text-destructive">{provider.error}</p>}
				<Field>
					<FieldLabel htmlFor={id}>{provider.stored ? "Replace API key" : "API key"}</FieldLabel>
					<div className="flex gap-2">
						<Input
							id={id}
							type="password"
							autoComplete="new-password"
							spellCheck={false}
							value={value}
							maxLength={4096}
							placeholder={provider.stored ? "Enter a replacement key" : "Paste your API key"}
							onChange={(event) => setValue(event.target.value)}
						/>
						<Button type="submit" disabled={!value.trim()}>Check and save</Button>
					</div>
				</Field>
				<div className="flex gap-2">
					{(provider.source === "keychain" || provider.source === "environment") && (
						<Button
							type="button"
							variant="outline"
							onClick={() => void run("key-check")}
						>
							Check connection
						</Button>
					)}
					{provider.stored && !confirm && (
						<Button
							type="button"
							variant="ghost"
							onClick={() => setConfirm(true)}
						>
							Remove saved key
						</Button>
					)}
				</div>
				{confirm && (
					<div className="flex flex-col gap-2">
						<p>Remove this saved key? New model requests will need another credential.</p>
						<div className="flex gap-2">
							<Button type="button" variant="destructive" onClick={() => void run("key-remove")}>
								Remove key
							</Button>
							<Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
								Cancel
							</Button>
						</div>
					</div>
				)}
				{action.busy && <p role="status">Checking with {provider.name} or waiting for Keychain…</p>}
				{action.error && <p role="alert" className="text-destructive">{action.error}</p>}
				{action.message && <p role="status" className="text-muted-foreground">{action.message}</p>}
			</fieldset>
		</form>
	);
}

function DefaultModel({ settings, disabled }: { settings: HostSettings; disabled: boolean }) {
	const [action, setAction] = useState<{ busy?: boolean; error?: string }>({});
	const chosen = settings.modelOverride || settings.model;
	const value = chosen ? `${chosen.provider}/${chosen.modelId}` : "";
	const available = settings.models.map((model) => `${model.provider}/${model.modelId}`);

	async function save(value: string) {
		const split = value.indexOf("/");
		const model = value
			? { provider: value.slice(0, split), modelId: value.slice(split + 1) }
			: null;
		setAction({ busy: true });
		try {
			await host.request({ op: "preferences", model });
			setAction({});
		} catch (error) {
			setAction({ error: (error as Error).message });
		}
	}

	return (
		<Field>
			<FieldLabel htmlFor="default-model">Default model</FieldLabel>
			<select
				id="default-model"
				aria-label="Default model"
				className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
				value={value}
				disabled={disabled || action.busy || !!settings.modelOverride}
				onChange={(event) => void save(event.target.value)}
			>
				<option value="">Automatic</option>
				{value && !available.includes(value) && (
					<option value={value} disabled>{value} (unavailable)</option>
				)}
				{available.map((model) => <option key={model} value={model}>{model}</option>)}
			</select>
			<p className="text-muted-foreground">
				{settings.modelOverride
					? "ACE_MODEL overrides this preference. Remove it and restart Ace Helper to use your saved choice."
					: "Used for a chat's first agent run. Existing chats keep their model."}
			</p>
			{action.busy && <p role="status">Saving default model…</p>}
			{action.error && <p role="alert" className="text-destructive">{action.error}</p>}
		</Field>
	);
}

export function Settings(
	{ onClose, initialSection }: { onClose: () => void; initialSection?: "updates" },
) {
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const [section, setSection] = useState<"providers" | "host" | "updates">(
		initialSection || (status === "open" ? "providers" : "host"),
	);
	const version = useSyncExternalStore(host.subscribe, () => host.settingsVersion);
	const [retry, setRetry] = useState(0);
	const [result, setResult] = useState<{ settings?: HostSettings; error?: string }>({});
	useEffect(() => {
		const updates = () => setSection("updates");
		window.addEventListener("ace:updates", updates);
		return () => window.removeEventListener("ace:updates", updates);
	}, []);

	useEffect(() => {
		if (status !== "open" || section !== "providers") return;
		let active = true;
		host.request<HostSettings>({ op: "settings" }).then(
			(settings) => {
				if (active) setResult({ settings });
			},
			(error: Error) => {
				if (active) setResult({ error: error.message });
			},
		);
		return () => {
			active = false;
		};
	}, [status, version, retry, section]);

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-inline-xl">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						{section === "providers"
							? "Provider keys stay in your system keychain. Changes apply to the next model request."
							: section === "updates"
							? "Keep Ace and Ace Helper up to date."
							: "Tools, team connectivity, and background hosting."}
					</DialogDescription>
				</DialogHeader>
				<nav aria-label="Settings sections" className="flex gap-2">
					<Button
						variant={section === "providers" ? "secondary" : "ghost"}
						aria-pressed={section === "providers"}
						onClick={() => setSection("providers")}
					>
						Providers
					</Button>
					<Button
						variant={section === "host" ? "secondary" : "ghost"}
						aria-pressed={section === "host"}
						onClick={() => setSection("host")}
					>
						{desktop ? "This Mac" : "This host"}
					</Button>
					{desktop && (
						<Button
							variant={section === "updates" ? "secondary" : "ghost"}
							aria-pressed={section === "updates"}
							onClick={() => setSection("updates")}
						>
							Updates
						</Button>
					)}
				</nav>
				{section === "updates" ? <UpdateSettings /> : section === "host" ? <HostStatus /> : (
					<>
						{status !== "open" && <p role="status">Waiting for Ace Helper to reconnect…</p>}
						{result.settings
							? (
								<>
									{result.settings.providers.map((provider) => (
										<Provider key={provider.id} provider={provider} disabled={status !== "open"} />
									))}
									<DefaultModel settings={result.settings} disabled={status !== "open"} />
									{result.settings.error && (
										<p role="alert" className="text-destructive">{result.settings.error}</p>
									)}
								</>
							)
							: !result.error && status === "open" && (
								<p role="status">Reading provider settings…</p>
							)}
						{result.error && <p role="alert" className="text-destructive">{result.error}</p>}
						<div className="flex justify-end">
							<Button
								variant="ghost"
								disabled={status !== "open"}
								onClick={() => setRetry((value) => value + 1)}
							>
								Refresh settings
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
