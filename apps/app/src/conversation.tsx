import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
	aceAvatar,
	type Attachment,
	ChatComposer,
	serialize,
	Timeline,
	toast,
	useMedia,
} from "@ace/ui";
import type { Listing, ModelRef } from "@ace/host/protocol";

import { host } from "./host";
import { images } from "./images";
import { toEvents } from "./timeline";
import { useTranscript } from "./transcript";

const MODES = [
	{ id: "chat", name: "Chat", placeholder: "Mention @ace to ask the agent" },
	{ id: "ace", name: "Ace", placeholder: "Ask the agent", mention: "ace" },
];
const MENTIONS = [{ name: "ace", avatar: aceAvatar }];
const ACE = /(^|\s)@ace\b/i;

const key = (model: ModelRef) => `${model.provider}/${model.modelId}`;

type Props = { channel: Listing; chat: number; user: string };

/** One chat's timeline and composer over its transcript; the content of a Chat tab. */
export function Conversation({ channel, chat: id, user }: Props) {
	const transcript = useTranscript(channel.id, id);
	// Runs use the credentials of the host that runs the channel, so offer that host's models.
	const [models, setModels] = useState<ModelRef[]>([]);
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const settingsVersion = useSyncExternalStore(host.subscribe, () => host.settingsVersion);
	useEffect(() => {
		if (status !== "open") return;
		let active = true;
		host.request<ModelRef[]>({ op: "models", host: channel.host }).then(
			(models) => {
				if (active) setModels(models);
			},
			() => {
				if (active) setModels([]);
			},
		);
		return () => {
			active = false;
		};
	}, [channel.host, status, settingsVersion]);
	const [mode, setMode] = useState("ace");
	const chat = transcript.info?.chats.find((value) => value.id === id);
	const [picked, setPicked] = useState<string>();
	const model = picked || (chat?.model ? key(chat.model) : key(channel.model));
	const events = useMemo(() => toEvents(transcript.items, channel.id, transcript.busy), [
		transcript.items,
		channel.id,
		transcript.busy,
	]);
	const archived = channel.state === "archived";
	// Formatting tools crowd a phone's composer; they stay one tap away.
	const phone = useMedia("(width < 40rem)");

	async function send(text: string, mode: string, attached: Attachment[]) {
		const invoke = mode === "ace" || ACE.test(text);
		const body = text.trim();
		if (!body && !attached.length) return;
		try {
			const encoded = attached.length ? { images: await images(attached) } : {};
			if (!invoke) {
				return void (await host.channel(channel.id, {
					op: "say",
					chat: id,
					author: user,
					text: body,
					...encoded,
				}));
			}
			const [provider, ...rest] = model.split("/");
			const selected = { provider: provider!, modelId: rest.join("/") };
			await host.channel(channel.id, {
				op: "ask",
				chat: id,
				author: user,
				text: body,
				...encoded,
				model: selected,
			});
		} catch (error) {
			toast.error("Could not send", { description: (error as Error).message });
		}
	}

	return (
		<>
			<div className="relative min-h-0 flex-1">
				<Timeline
					className="h-full min-h-0 contain-paint scroll-fade [--fade:3rem]"
					events={events}
					toolbar={false}
					working={transcript.busy || undefined}
					currentUser={{ login: user }}
					intro={{ name: channel.name, createdAt: Math.floor(channel.created / 1000) }}
				/>
				{transcript.draft && (
					<div className="utils:max-width pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-2 text-sm whitespace-pre-wrap text-muted-foreground">
						{transcript.draft}
					</div>
				)}
			</div>
			<div className="utils:max-width relative z-20 shrink-0 px-3 pb-3">
				<ChatComposer
					scope={`/channels/${channel.id}`}
					tools={!phone}
					modes={MODES}
					mode={mode}
					onModeChange={setMode}
					mentions={MENTIONS}
					models={models.map((value) => ({
						id: key(value),
						name: value.modelId,
						vendor: value.provider,
					}))}
					model={model}
					onModelChange={setPicked}
					busy={transcript.busy}
					canStop={transcript.busy}
					onStop={() => void host.channel(channel.id, { op: "stop", chat: id })}
					canSend={!archived}
					onSend={({ doc, mode, attachments }) => void send(serialize(doc), mode, attachments)}
				/>
			</div>
		</>
	);
}
