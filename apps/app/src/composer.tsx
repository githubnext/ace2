import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
	aceAvatar,
	type Attachment,
	Button,
	ChatComposer,
	type ChatComposerHandle,
	serialize,
	toast,
	useMedia,
} from "@ace/ui";
import type { Effort, ModelOption, ModelRef } from "@ace/channel/protocol";
import type { Listing } from "@ace/host/protocol";

import { host } from "./host";
import { images } from "./images";

const MODES = [
	{ id: "chat", name: "Chat", placeholder: "Mention @ace to ask the agent" },
	{ id: "ace", name: "Ace", placeholder: "Ask the agent", mention: "ace" },
];
const MENTIONS = [{ name: "ace", avatar: aceAvatar }];
const EFFORTS: Record<Effort, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
};
const ACE = /(^|\s)@ace\b/i;
// Channel views remount on navigation; a deliberate mode choice outlives them for this session.
const chosen = new Map<string, string>();

const key = (model: ModelRef) => `${model.provider}/${model.modelId}`;

type Props = {
	channel: Listing;
	chat: number;
	user: string;
	current?: ModelRef;
	currentEffort?: Effort;
	busy: boolean;
	ready: boolean;
	draft?: string;
	onDraftLoaded: () => void;
	onSettings?: () => void;
	accessory?: ReactNode;
};

/** A failed admission keeps the draft and attachments available for retry. */
export function Composer(
	{
		channel,
		chat: id,
		user,
		current,
		currentEffort,
		busy,
		ready,
		draft,
		onDraftLoaded,
		onSettings,
		accessory,
	}: Props,
) {
	const composer = useRef<ChatComposerHandle>(null);
	const sending = useRef(false);
	const [pending, setPending] = useState(false);
	const [attached, setAttached] = useState<Attachment[]>([]);
	const [mode, setMode] = useState(chosen.get(channel.id) || "ace");
	const [models, setModels] = useState<ModelOption[]>();
	const [modelError, setModelError] = useState<string>();
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const settingsVersion = useSyncExternalStore(host.subscribe, () => host.settingsVersion);
	useEffect(() => {
		if (!draft) return;
		composer.current?.set(ACE.test(draft) ? draft : `@ace ${draft}`);
		onDraftLoaded();
	}, [draft, onDraftLoaded]);
	useEffect(() => {
		if (status !== "open" || mode !== "ace") return;
		let active = true;
		// Ask the channel itself: a hosted channel uses the service's credentials, not its workspace's.
		host.channel<ModelOption[]>(channel.id, { op: "models" }).then(
			(models) => {
				if (!active) return;
				setModels(models);
				setModelError(undefined);
			},
			(error: Error) => {
				if (!active) return;
				setModels([]);
				setModelError(error.message);
			},
		);
		return () => {
			active = false;
		};
	}, [channel.id, mode, status, settingsVersion]);
	const [picked, setPicked] = useState<string>();
	const model = picked || (current ? key(current) : "auto");
	const [pickedEffort, setPickedEffort] = useState<Effort>();
	const levels = models?.find((value) => key(value) === model)?.efforts;
	const requestedEffort = pickedEffort
		|| (current && key(current) === model ? currentEffort : undefined) || "off";
	const effort = requestedEffort === "off" || levels?.includes(requestedEffort)
		? requestedEffort
		: "off";
	const efforts = levels && levels.some((level) => level !== "off")
		? (levels.includes("off") ? levels : ["off" as const, ...levels]).map((id) => ({
			id,
			name: id === "off" && !levels.includes("off") ? "Default" : EFFORTS[id],
		}))
		: undefined;
	const choices = (models || []).map((value) => ({
		id: key(value),
		name: value.modelId,
		vendor: value.provider,
	}));
	if (model === "auto") choices.unshift({ id: "auto", name: "Automatic", vendor: "" });
	else if (!choices.some((value) => value.id === model)) {
		choices.unshift({ id: model, name: model.split("/").slice(1).join("/"), vendor: "" });
	}
	// Formatting tools crowd a phone's composer; they stay one tap away.
	const phone = useMedia("(width < 40rem)");

	async function send(text: string, mode: string, attached: Attachment[]) {
		if (sending.current) return;
		const invoke = mode === "ace" || ACE.test(text);
		const body = text.trim();
		if (!body && !attached.length) return;
		const doc = composer.current?.get();
		sending.current = true;
		setPending(true);
		try {
			const encoded = attached.length ? { images: await images(attached) } : {};
			if (invoke) {
				const [provider, ...rest] = model.split("/");
				await host.channel(channel.id, {
					op: "ask",
					...(levels ? { effort } : {}),
					chat: id,
					author: user,
					text: body,
					...encoded,
					...(model === "auto" ? {} : { model: { provider: provider!, modelId: rest.join("/") } }),
				});
			} else {
				await host.channel(channel.id, {
					op: "say",
					chat: id,
					author: user,
					text: body,
					...encoded,
				});
			}
			if (composer.current?.get() === doc) composer.current?.clear();
			const sent = new Set(attached);
			setAttached((current) => current.filter((value) => !sent.has(value)));
		} catch (error) {
			toast.error(invoke ? "Could not invoke agent" : "Could not send message", {
				description: (error as Error).message,
				...(invoke && onSettings ? { action: { label: "Settings", onClick: onSettings } } : {}),
			});
		} finally {
			sending.current = false;
			setPending(false);
		}
	}

	return (
		<>
			{mode === "ace" && models?.length === 0 && (
				<div
					className="mb-2 flex items-center justify-between gap-3 px-3 text-xs text-muted-foreground"
					role="status"
				>
					<p>
						{modelError || "Add a provider to use Ace. You can still send messages in Chat mode."}
					</p>
					{onSettings && (
						<Button size="sm" variant="ghost" onClick={onSettings}>Provider settings</Button>
					)}
				</div>
			)}
			<ChatComposer
				ref={composer}
				accessory={accessory}
				scope={`/channels/${channel.id}`}
				tools={!phone}
				modes={MODES}
				mode={mode}
				onModeChange={(value) => {
					chosen.set(channel.id, value);
					setMode(value);
				}}
				mentions={MENTIONS}
				models={choices}
				model={model}
				onModelChange={(value) => {
					setPicked(value === "auto" ? undefined : value);
					setPickedEffort(undefined);
				}}
				efforts={efforts}
				effort={effort}
				onEffortChange={(value) => setPickedEffort(value as Effort)}
				attachments={attached}
				onAttachmentsChange={setAttached}
				busy={busy}
				submitBusy={pending}
				canStop={busy}
				onStop={() => void host.channel(channel.id, { op: "stop", chat: id })}
				canSend={ready && status === "open" && !pending}
				clearOnSend={false}
				onSend={({ doc, mode, attachments }) => void send(serialize(doc), mode, attachments)}
			/>
		</>
	);
}
