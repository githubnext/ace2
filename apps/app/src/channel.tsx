import { useCallback, useRef, useState } from "react";

import type { Changes } from "@ace/channel/protocol";
import type { Listing } from "@ace/host/protocol";
import { SessionDetailsView, Sidebar, useLayoutRight } from "@ace/ui";

import { Conversation } from "./conversation";
import { host } from "./host";
import { CHAT, Layout } from "./layout/layout";
import { Diff } from "./panels/diff";
import { Terminal } from "./panels/terminal";

// Channels have one chat today; its tabs follow the chat the Chat tab shows.
const chat = 1;

export type ChannelDraft = { channel: string; text: string };

type Props = {
	channel: Listing;
	user: string;
	remote: boolean;
	draft?: ChannelDraft;
	onDraftLoaded: () => void;
	onSettings?: () => void;
};

export function ChannelDetails({ channel }: { channel: Listing }) {
	const right = useLayoutRight();
	return (
		<Sidebar
			side="right"
			id="channel-details"
			aria-hidden={!right.open}
			inert={!right.open}
			className="-my-2 h-[calc(100%+1rem)]"
			innerClassName="h-full min-h-0"
		>
			<SessionDetailsView summary={channel.summary} onClose={() => right.setOpen(false)} />
		</Sidebar>
	);
}

/** A channel's tabs: its chat, plus Diff and Terminal views of that chat's lane. */
export function Channel({ channel, user, remote, draft, onDraftLoaded, onSettings }: Props) {
	const [changed, setChanged] = useState<boolean>();
	const check = useRef({ busy: false, again: false });

	// One check at a time; work that lands during a check asks for one more after it.
	const inspect = useCallback(() => {
		const run = check.current;
		if (run.busy) {
			run.again = true;
			return;
		}
		run.busy = true;
		host.channel<Changes>(channel.id, { op: "changes", chat }).then(
			(value) => setChanged(value.files.length > 0),
			() => {},
		).finally(() => {
			run.busy = false;
			if (!run.again) return;
			run.again = false;
			inspect();
		});
	}, [channel.id]);

	return (
		<Layout
			id={channel.id}
			name={remote ? `${channel.name} · ${channel.host}` : channel.name}
			chat={chat}
			changed={changed}
			render={(data, uid, active, update) => {
				if (uid === CHAT) {
					return (
						<Conversation
							channel={channel}
							chat={chat}
							user={user}
							draft={draft?.channel === channel.id ? draft.text : undefined}
							onDraftLoaded={onDraftLoaded}
							onSettings={!remote && !channel.hosted ? onSettings : undefined}
							onWork={inspect}
						/>
					);
				}
				if (data.type === "diff") {
					return <Diff channel={channel.id} chat={data.chat} active={active} />;
				}
				if (data.type !== "terminal") return null;
				return (
					<Terminal
						channel={channel.id}
						chat={data.chat}
						active={active}
						terminal={data.terminal}
						onTerminal={(terminal) => update({ terminal })}
					/>
				);
			}}
			onTabClose={(_, data) => {
				if (data.type !== "terminal" || !data.terminal) return;
				host.request({ op: "terminal-close", terminal: data.terminal }).catch(() => {});
			}}
		/>
	);
}
