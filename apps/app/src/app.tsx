import { useEffect, useState, useSyncExternalStore } from "react";

import {
	Layout,
	Main,
	SessionSidebar,
	type SessionSidebarGroup,
	type SessionSidebarRepo,
	Sidebar,
	type SidebarRow,
	ThemeProvider,
	toast,
	Toaster,
	TooltipProvider,
	useLocalStorage,
} from "@ace/ui";
import type { Hello, Listing } from "@ace/host/protocol";

import { Conversation } from "./conversation";
import { host } from "./host";
import { NewChannel } from "./new-channel";

function basename(path: string) {
	return path.replace(/\/+$/, "").split("/").pop() || path;
}

function row(channel: Listing, user: string): SidebarRow {
	return {
		uid: channel.id,
		kind: "session",
		name: channel.name,
		createdAt: Math.floor(channel.created / 1000),
		lifecycle: channel.state === "archived" ? "archived" : "live",
		private: false,
		mine: channel.owner === user,
		member: true,
		connection: channel.state === "running"
			? "connected"
			: channel.state === "offline"
			? "offline"
			: "idle",
		agent: "idle",
		unreadCount: 0,
		mentionCount: 0,
		lastActivityAt: Math.floor(channel.created / 1000),
		online: [],
	};
}

export function App() {
	const channels = useSyncExternalStore(host.subscribe, () => host.channels);
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const [hello, setHello] = useState<Hello>({ user: "", host: "" });
	const user = hello.user;
	const [selected, setSelected] = useLocalStorage<string | undefined>("ace:channel", undefined);
	const [project, setProject] = useLocalStorage<string | undefined>("ace:project", undefined);
	const [adding, setAdding] = useState(false);
	const [left, setLeft] = useLocalStorage("panel:left", true);
	const [width, setWidth] = useLocalStorage("panel:left:width", 220);

	useEffect(() => {
		if (status !== "open") return;
		host.request<Hello>({ op: "hello" }).then(setHello);
	}, [status]);

	const projects = [...new Set(channels.map((channel) => channel.project))];
	const current = project && projects.includes(project) ? project : projects[0];
	const visible = channels.filter((channel) => channel.project === current);
	const channel = channels.find((value) => value.id === selected);
	const repos: SessionSidebarRepo[] = projects.map((path) => ({
		id: path,
		name: basename(path),
		org: "Local",
	}));
	const groups: SessionSidebarGroup[] = [
		{
			id: "mine",
			label: "Channels",
			rows: visible.filter((value) => value.state !== "archived" && value.owner === user)
				.map((value) => row(value, user)),
		},
		{
			id: "team",
			label: "Team",
			rows: visible.filter((value) => value.state !== "archived" && value.owner !== user)
				.map((value) => row(value, user)),
		},
		{
			id: "archived",
			label: "Archived",
			rows: visible.filter((value) => value.state === "archived").map((value) => row(value, user)),
			collapsed: true,
		},
	];

	async function create(path: string) {
		try {
			const created = await host.request<Listing>({ op: "create", project: path });
			setProject(created.project);
			setSelected(created.id);
		} catch (error) {
			toast.error("Could not create channel", { description: (error as Error).message });
		}
	}

	return (
		<ThemeProvider storageKey="ace-theme">
			<TooltipProvider>
				<Layout
					appearance="web"
					defaultNavOpen={false}
					leftOpen={left}
					onLeftChange={setLeft}
					leftWidth={width}
					onLeftWidthChange={setWidth}
					loading={status !== "open"}
				>
					<Sidebar side="left">
						<SessionSidebar
							className="min-h-0 w-full min-w-0 flex-1 bg-transparent"
							projectName={current ? basename(current) : "Projects"}
							repos={repos}
							selectedRepoId={current}
							groups={groups}
							selectedUid={channel?.id}
							loading={status !== "open" && !channels.length}
							onRepoChange={(repo) => setProject(repo.id)}
							onAddRepo={() => setAdding(true)}
							onSelect={(item) => setSelected(item.uid)}
							onNewSession={current ? () => void create(current) : () => setAdding(true)}
							onArchive={(item) =>
								void host.request({ op: "archive", channel: item.uid, archived: true })}
							onDelete={(item) => void host.request({ op: "delete", channel: item.uid })}
						/>
					</Sidebar>
					<Main className="overflow-hidden">
						{channel
							? (
								<Conversation
									key={channel.id}
									channel={channel}
									user={user}
									remote={channel.host !== hello.host}
								/>
							)
							: <NewChannel onCreate={(path) => void create(path)} />}
					</Main>
				</Layout>
				<NewChannel
					dialog
					open={adding}
					onOpenChange={setAdding}
					onCreate={(path) => {
						setAdding(false);
						void create(path);
					}}
				/>
				<Toaster />
			</TooltipProvider>
		</ThemeProvider>
	);
}
