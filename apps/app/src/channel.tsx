import type { Listing } from "@ace/host/protocol";

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

/** A channel's tabs: its chat, plus Diff and Terminal views of that chat's lane. */
export function Channel({ channel, user, remote, draft, onDraftLoaded, onSettings }: Props) {
	return (
		<Layout
			id={channel.id}
			name={remote ? `${channel.name} · ${channel.host}` : channel.name}
			chat={chat}
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
