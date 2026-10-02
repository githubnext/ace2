import { useMemo, useState } from "react";

import { aceAvatar, ChatComposer, serialize, Timeline, toast } from "@ace/ui";
import type { Listing, ModelRef } from "@ace/host/protocol";

import { host } from "./host";
import { toEvents } from "./timeline";
import { useTranscript } from "./transcript";

const MODES = [
	{ id: "chat", name: "Chat", placeholder: "Mention @ace to ask the agent" },
	{ id: "ace", name: "Ace", placeholder: "Ask the agent", mention: "ace" },
];
const MENTIONS = [{ name: "ace", avatar: aceAvatar }];
const ACE = /(^|\s)@ace\b/i;

const key = (model: ModelRef) => `${model.provider}/${model.modelId}`;

type Props = { channel: Listing; models: ModelRef[]; user: string };

/** One channel's chat: the original timeline and composer over the channel's transcript. */
export function Conversation({ channel, models, user }: Props) {
	const transcript = useTranscript(channel.id);
	const [mode, setMode] = useState("ace");
	const chat = transcript.info?.chats.find((value) => value.id === 1);
	const [picked, setPicked] = useState<string>();
	const model = picked || (chat?.model ? key(chat.model) : key(channel.model));
	const events = useMemo(() => toEvents(transcript.items, channel.id, transcript.busy), [
		transcript.items,
		channel.id,
		transcript.busy,
	]);
	const archived = channel.state === "archived";

	async function send(text: string, mode: string) {
		const invoke = mode === "ace" || ACE.test(text);
		const body = text.trim();
		if (!body) return;
		try {
			if (!invoke) {
				return void (await host.channel(channel.id, { op: "say", author: user, text: body }));
			}
			const [provider, ...rest] = model.split("/");
			const selected = { provider: provider!, modelId: rest.join("/") };
			await host.channel(channel.id, { op: "ask", author: user, text: body, model: selected });
		} catch (error) {
			toast.error("Could not send", { description: (error as Error).message });
		}
	}

	return (
		<>
			<header className="flex h-11 shrink-0 items-center gap-2 px-4 text-sm electrobun-webkit-app-region-drag">
				<span className="font-medium">#{channel.name}</span>
				<span className="truncate text-muted-foreground">{channel.project}</span>
				{chat?.lane && <span className="text-muted-foreground">· lane {chat.lane}</span>}
			</header>
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
					canAttach={false}
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
					onStop={() => void host.channel(channel.id, { op: "stop" })}
					canSend={!archived}
					onSend={({ doc, mode }) => void send(serialize(doc), mode)}
				/>
			</div>
		</>
	);
}
