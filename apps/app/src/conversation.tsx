import { useEffect, useMemo } from "react";

import { Button, Timeline } from "@ace/ui";
import type { Listing } from "@ace/host/protocol";

import { Composer } from "./composer";
import { toEvents } from "./timeline";
import { useTranscript } from "./transcript";
import { Usage } from "./usage";

type Props = {
	channel: Listing;
	chat: number;
	user: string;
	draft?: string;
	onDraftLoaded: () => void;
	onSettings?: () => void;
	/** Called once the chat loads and whenever its agent may have changed files since. */
	onWork?: () => void;
};

/** One chat's timeline and composer over its transcript; the content of a Chat tab. */
export function Conversation(
	{ channel, chat: id, user, draft, onDraftLoaded, onSettings, onWork }: Props,
) {
	const transcript = useTranscript(channel.id, id);
	const chat = transcript.info?.chats.find((value) => value.id === id);
	const events = useMemo(() => toEvents(transcript.items, channel.id, transcript.busy), [
		transcript.items,
		channel.id,
		transcript.busy,
	]);
	const results = useMemo(
		() =>
			transcript.items.reduce(
				(sum, item) =>
					item.kind === "reply" ? sum + item.tools.filter((tool) => tool.result).length : sum,
				0,
			),
		[transcript.items],
	);

	useEffect(() => {
		if (transcript.live) onWork?.();
	}, [transcript.live, transcript.busy, results, onWork]);
	return (
		<>
			<div className="relative min-h-0 flex-1">
				{transcript.live
					? (
						<Timeline
							className="h-full min-h-0 contain-paint scroll-fade [--fade:3rem]"
							events={events}
							toolbar={false}
							working={transcript.busy || undefined}
							currentUser={{ login: user }}
							intro={{ name: channel.name, createdAt: Math.floor(channel.created / 1000) }}
						/>
					)
					: (
						<div
							className="grid h-full place-content-center justify-items-center gap-3 px-6 text-center text-sm text-muted-foreground"
							role={transcript.error ? "alert" : "status"}
						>
							<p>
								{transcript.error
									|| (channel.state === "dormant" ? "Starting channel…" : "Loading chat…")}
							</p>
							{transcript.error && <Button onClick={transcript.retry}>Try again</Button>}
						</div>
					)}
				{transcript.draft && (
					<div className="utils:max-width pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-2 text-sm whitespace-pre-wrap text-muted-foreground">
						{transcript.draft}
					</div>
				)}
			</div>
			<div className="utils:max-width relative z-20 shrink-0 px-3 pb-3">
				<Composer
					channel={channel}
					chat={id}
					user={user}
					current={chat?.model || channel.model}
					busy={transcript.busy}
					ready={transcript.live && channel.state !== "archived"}
					draft={draft}
					onDraftLoaded={onDraftLoaded}
					onSettings={onSettings}
					accessory={chat?.usage && <Usage value={chat.usage} context={chat.context} />}
				/>
			</div>
		</>
	);
}
