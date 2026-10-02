import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
	Button,
	Layout,
	Main,
	SessionSidebar,
	type SessionSidebarGroup,
	type SessionSidebarGroupId,
	type SessionSidebarRepo,
	Sidebar,
	type SidebarRow,
	ThemeProvider,
	toast,
	Toaster,
	TooltipProvider,
	useLocalStorage,
} from "@ace/ui";
import { IconHash, IconPlus } from "@ace/ui/icons";
import type { Hello, HostRequest, Listing, Project } from "@ace/host/protocol";

import { Channel } from "./channel";
import { Dashboard } from "./dashboard";
import { desktop, titlebar } from "./desktop";
import { host } from "./host";
import { Navigation, type Page, WindowControls } from "./navigation";
import { EmptyProjects, OpenProject } from "./open-project";
import { projectId, projects } from "./projects";
import { Settings } from "./settings";

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
	const opened = useSyncExternalStore(host.subscribe, () => host.projects);
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const [hello, setHello] = useState<Hello>({ user: "", host: "" });
	const [page, setPage] = useLocalStorage<Page>("ace:page", "dashboard");
	const [project, setProject] = useLocalStorage<string | undefined>("ace:project-id", undefined);
	const [selected, setSelected] = useLocalStorage<Record<string, string>>(
		"ace:project-channels",
		{},
	);
	const [adding, setAdding] = useState(false);
	const [settings, setSettings] = useState(false);
	const [left, setLeft] = useLocalStorage("panel:left", true);
	const [width, setWidth] = useLocalStorage("panel:left:width", 200);
	const [collapsed, setCollapsed] = useState<Record<SessionSidebarGroupId, boolean>>({
		pinned: false,
		mine: false,
		team: false,
		archived: true,
	});
	const picking = useRef(false);
	const creating = useRef(false);

	useEffect(() => {
		if (status !== "open") return;
		host.request<Hello>({ op: "hello" }).then(setHello, () => {});
	}, [status]);

	const available = useMemo(() => projects(opened, channels, hello.host), [
		opened,
		channels,
		hello.host,
	]);
	const current = available.find((value) => value.id === project) || available[0];
	const visible = channels.filter((channel) =>
		channel.host === current?.host && channel.project === current.path
	);
	const channel = current ? visible.find((value) => value.id === selected[current.id]) : undefined;
	const connected = status === "open" && !!hello.host;
	const local = current?.host === hello.host;
	const repos: SessionSidebarRepo[] = available.map((value) => ({
		id: value.id,
		name: value.host === hello.host ? value.name : `${value.name} · ${value.host}`,
		org: "",
	}));
	const groups: SessionSidebarGroup[] = [
		{
			id: "mine",
			label: "Channels",
			rows: visible.filter((value) => value.state !== "archived" && value.owner === hello.user).map(
				(value) => row(value, hello.user),
			),
			collapsed: collapsed.mine,
		},
		{
			id: "team",
			label: "Team",
			rows: visible.filter((value) => value.state !== "archived" && value.owner !== hello.user).map(
				(value) => row(value, hello.user),
			),
			collapsed: collapsed.team,
		},
		{
			id: "archived",
			label: "Archived",
			rows: visible.filter((value) => value.state === "archived").map((value) =>
				row(value, hello.user)
			),
			collapsed: collapsed.archived,
		},
	];

	function select(value: Pick<Listing, "id" | "host" | "project">) {
		const id = projectId(value.host, value.project);
		setProject(id);
		setSelected((previous) => ({ ...previous, [id]: value.id }));
		setPage("channels");
	}

	async function open(path: string) {
		const value = await host.request<Project>({ op: "project-open", path });
		setProject(projectId(hello.host, value.path));
	}

	async function choose() {
		if (!connected || picking.current) return;
		if (!desktop) return setAdding(true);
		picking.current = true;
		try {
			const path = await desktop.project();
			if (path) await open(path);
		} catch (error) {
			toast.error("Could not open project", { description: (error as Error).message });
		} finally {
			picking.current = false;
		}
	}

	async function create(text?: string, onCreated?: () => void): Promise<void> {
		if (!current || !local || !connected || creating.current) return;
		creating.current = true;
		try {
			const value = await host.request<Pick<Listing, "id" | "project">>({
				op: "create",
				project: current.path,
			});
			try {
				if (text) await host.channel(value.id, { op: "ask", author: hello.user, text });
				onCreated?.();
			} finally {
				select({ ...value, host: hello.host });
			}
		} catch (error) {
			toast.error("Could not start channel", {
				description: (error as Error).message,
				action: { label: "Settings", onClick: () => setSettings(true) },
			});
		} finally {
			creating.current = false;
		}
	}

	async function change(request: HostRequest) {
		try {
			await host.request(request);
		} catch (error) {
			toast.error("Could not update channel", { description: (error as Error).message });
		}
	}

	return (
		<ThemeProvider storageKey="ace-theme">
			<TooltipProvider>
				<Layout
					appearance={desktop ? "native" : "web"}
					defaultNavOpen={false}
					leftOpen={left}
					onLeftChange={setLeft}
					leftWidth={width}
					onLeftWidthChange={setWidth}
					loading={status === "connecting"}
					onDoubleClick={titlebar}
					nav={
						<Navigation
							page={page}
							user={hello.user}
							onPage={setPage}
							onSettings={() => setSettings(true)}
						/>
					}
				>
					<WindowControls
						onOpen={() => void choose()}
						onSettings={() => setSettings(true)}
						onPage={setPage}
						connected={connected}
					/>
					{page === "channels" && current && (
						<Sidebar
							side="left"
							className="-my-2 h-[calc(100%+1rem)]"
							innerClassName="h-full min-h-0"
						>
							<SessionSidebar
								className="min-h-0 w-full min-w-0 flex-1 bg-transparent"
								projectName={current.name}
								repos={repos}
								selectedRepoId={current.id}
								groups={groups}
								selectedUid={channel?.id}
								loading={status === "connecting" && !channels.length}
								onRepoChange={(repo) => setProject(repo.id)}
								onAddRepo={connected ? () => void choose() : undefined}
								onSelect={(item) => {
									const value = visible.find((value) => value.id === item.uid);
									if (value) select(value);
								}}
								onNewSession={local && connected ? () => void create() : undefined}
								onToggleGroup={(id) => setCollapsed((value) => ({ ...value, [id]: !value[id] }))}
								onArchive={local && connected
									? (item) =>
										void change({
											op: "archive",
											channel: item.uid,
											archived: item.lifecycle !== "archived",
										})
									: undefined}
								onDelete={local && connected
									? (item) => void change({ op: "delete", channel: item.uid })
									: undefined}
								empty={
									<p className="px-4 py-6 text-xs text-muted-foreground">
										No channels in this project yet.
									</p>
								}
							/>
						</Sidebar>
					)}
					<Main
						className={page === "channels" && channel
							? "overflow-hidden bg-background"
							: "overflow-y-auto bg-background"}
					>
						{status === "closed" && (
							<p role="status" className="border-b px-4 py-2 text-xs text-muted-foreground">
								{desktop
									? "Disconnected from Ace Helper. Open Settings → This Mac to start it."
									: "Disconnected from Ace Helper. Open the Ace desktop app or use ace open to reconnect."}
							</p>
						)}
						{!current
							? <EmptyProjects onOpen={() => void choose()} disabled={!connected} />
							: page === "dashboard"
							? (
								<Dashboard
									key={current.id}
									project={current}
									repos={repos}
									channels={visible}
									local={local}
									connected={connected}
									onProject={setProject}
									onOpen={() => void choose()}
									onChannel={select}
									onCreate={create}
								/>
							)
							: channel
							? (
								<Channel
									key={channel.id}
									channel={channel}
									user={hello.user}
									remote={!local}
								/>
							)
							: (
								<div className="flex min-h-full flex-col items-center justify-center gap-4 px-5 py-10 text-center">
									<IconHash className="size-6 text-muted-foreground" aria-hidden />
									<h1 className="text-base font-medium">Choose a channel in {current.name}</h1>
									{local && (
										<Button
											disabled={!connected}
											onClick={() => void create()}
										>
											<IconPlus aria-hidden />New channel
										</Button>
									)}
								</div>
							)}
					</Main>
				</Layout>
				{adding && <OpenProject onOpen={open} onClose={() => setAdding(false)} />}
				{settings && <Settings onClose={() => setSettings(false)} />}
				<Toaster />
			</TooltipProvider>
		</ThemeProvider>
	);
}
