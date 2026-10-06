import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
	Button,
	Layout,
	Main,
	SessionSidebar,
	type SessionSidebarGroup,
	type SessionSidebarGroupId,
	type SessionSidebarProps,
	type SessionSidebarRepo,
	Sidebar,
	type SidebarRow,
	ThemeProvider,
	toast,
	Toaster,
	TooltipProvider,
	useLayoutLeft,
	useLayoutRight,
	useLocalStorage,
	useMedia,
} from "@ace/ui";
import { IconHash, IconPlus } from "@ace/ui/icons";
import type { Hello, HostRequest, Listing, Project } from "@ace/host/protocol";

import { chosen, deployed, remember } from "./address";
import { Channel, ChannelDetails, type ChannelDraft } from "./channel";
import { Dashboard } from "./dashboard";
import { Github, GithubSidebar } from "./github";
import { useGithubRefresh } from "./github-cache";
import { desktop, titlebar } from "./desktop";
import { host } from "./host";
import { Rename } from "./layout/rename";
import { Navigation, type Page, WindowControls } from "./navigation";
import { EmptyProjects, OpenProject } from "./open-project";
import { projectId, projects, root } from "./projects";
import { Settings } from "./settings";
import { UpdateNotice } from "./updates";

// Older versions saved an inline GitHub item per project; Ace now opens items on GitHub.
localStorage.removeItem(`ace:github-targets:${host.url}`);

/**
 * On a phone the channel list is a drawer over the channel: open while no channel is chosen, and
 * out of the way once one is.
 */
function Drawers({ page, channel }: { page: string; channel?: string }) {
	const left = useLayoutLeft();
	const { setOpen: setRightOpen } = useLayoutRight();
	const phone = useMedia("(width < 40rem)");
	const { setOpen } = left;
	useEffect(() => {
		if (phone) setOpen(page === "channels" && !channel);
	}, [phone, page, channel, setOpen]);
	useEffect(() => {
		if (page !== "channels" || !channel) setRightOpen(false);
	}, [page, channel, setRightOpen]);
	return null;
}

function ChannelsSidebar(props: SessionSidebarProps) {
	const left = useLayoutLeft();
	const right = useLayoutRight();
	const phone = useMedia("(width < 40rem)");
	return (
		<SessionSidebar
			{...props}
			onInfo={(item) => {
				props.onSelect?.(item);
				if (phone) left.setOpen(false);
				right.setOpen(true);
			}}
		/>
	);
}

function Disconnected() {
	if (desktop) return <>Disconnected from Ace Helper. Open Settings → This Mac to start it.</>;
	if (!deployed) return <>Disconnected from your host. Reconnecting…</>;
	return (
		<>
			Can't reach {chosen}. Check that Tailscale is on.{" "}
			<button
				type="button"
				className="underline underline-offset-2"
				onClick={() => {
					remember(undefined);
					location.reload();
				}}
			>
				Change host
			</button>
		</>
	);
}

/** Channels idle this long fold into the Inactive group until their transcript grows again. */
const INACTIVE_AFTER = 6 * 60 * 60_000;
const ALL_PROJECTS = "all";
const RECENT_CHANNELS = 10;

function row(channel: Listing, user: string, host: string): SidebarRow {
	return {
		uid: channel.id,
		kind: "session",
		name: channel.name,
		summary: channel.summary,
		createdAt: Math.floor(channel.created / 1000),
		lifecycle: channel.state === "archived" ? "archived" : "live",
		private: false,
		mine: channel.owner === user,
		member: true,
		capabilities: {
			rename: channel.owner === user && channel.state !== "offline",
			archive: channel.host === host,
		},
		connection: channel.state === "running"
			? "connected"
			: channel.state === "offline"
			? "offline"
			: "idle",
		agent: channel.state === "running" && channel.busy ? "thinking" : "idle",
		unreadCount: 0,
		mentionCount: 0,
		lastActivityAt: Math.floor((channel.active || channel.created) / 1000),
		online: [],
	};
}

export function App() {
	const channels = useSyncExternalStore(host.subscribe, () => host.channels);
	const opened = useSyncExternalStore(host.subscribe, () => host.projects);
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const people = useSyncExternalStore(host.subscribe, () => host.people);
	const [hello, setHello] = useState<Hello>({ user: "", host: "" });
	const [page, setPage] = useLocalStorage<Page>("ace:page", "dashboard");
	const [project, setProject] = useLocalStorage<string | undefined>("ace:project-id", undefined);
	const [all, setAll] = useLocalStorage("ace:all-projects", false);
	const [selected, setSelected] = useLocalStorage<Record<string, string>>(
		"ace:project-channels",
		{},
	);
	const [adding, setAdding] = useState(false);
	const [settings, setSettings] = useState<boolean | "updates">(false);
	const [draft, setDraft] = useState<ChannelDraft>();
	const [renaming, setRenaming] = useState<{ id: string; name: string }>();
	const [left, setLeft] = useLocalStorage("panel:left", true);
	const [width, setWidth] = useLocalStorage("panel:left:width", 200);
	const [collapsed, setCollapsed] = useState<Record<SessionSidebarGroupId, boolean>>({
		pinned: false,
		mine: false,
		team: false,
		inactive: true,
		archived: true,
	});
	const [now, setNow] = useState(Date.now);
	const picking = useRef(false);
	const creating = useRef(false);
	useEffect(() => {
		const open = () => setSettings("updates");
		window.addEventListener("ace:updates", open);
		if (location.hash === "#updates") {
			history.replaceState(null, "", location.pathname + location.search);
			open();
		}
		return () => window.removeEventListener("ace:updates", open);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		if (status !== "open") return;
		host.request<Hello>({ op: "hello" }).then(setHello, () => {});
	}, [status]);

	const available = useMemo(() => projects(opened, channels, hello.host), [
		opened,
		channels,
		hello.host,
	]);
	useGithubRefresh(available);
	const allProjects = all && page === "channels";
	const listings = new Map(channels.map((channel) => [channel.id, channel]));
	const allSelected = listings.get(selected[ALL_PROJECTS]);
	const current = available.find((value) => value.id === project) || available[0];
	const visible = channels.filter((channel) =>
		channel.host === current?.host && root(channel) === current.path
	);
	const channel = allProjects
		? allSelected
		: current
		? visible.find((value) => value.id === selected[current.id])
		: undefined;
	const connected = status === "open" && !!hello.host;
	const local = current?.host === hello.host;
	const repos: SessionSidebarRepo[] = [
		{
			id: ALL_PROJECTS,
			name: "All Projects",
			org: "",
			kind: "all",
		},
		...available.map((value) => ({
			id: value.id,
			name: value.host === hello.host ? value.name : `${value.name} · ${value.host}`,
			org: value.repo?.split("/")[0] || "",
		})),
	];
	const sorted: Record<"mine" | "team" | "inactive" | "archived", SidebarRow[]> = {
		mine: [],
		team: [],
		inactive: [],
		archived: [],
	};
	for (const value of visible) {
		const group = value.state === "archived"
			? "archived"
			: !value.busy && now - (value.active || value.created) > INACTIVE_AFTER
			? "inactive"
			: value.owner === hello.user
			? "mine"
			: "team";
		sorted[group].push(row(value, hello.user, hello.host));
	}
	let groups: SessionSidebarGroup[] = [
		{ id: "mine", label: "Channels", rows: sorted.mine, collapsed: collapsed.mine },
		{ id: "team", label: "Team", rows: sorted.team, collapsed: collapsed.team },
		{ id: "inactive", label: "Inactive", rows: sorted.inactive, collapsed: collapsed.inactive },
		{ id: "archived", label: "Archived", rows: sorted.archived, collapsed: collapsed.archived },
	];

	if (allProjects) {
		const byProject = new Map<string, Listing[]>();
		for (const value of channels) {
			if (value.state === "archived") continue;
			const id = projectId(value.host, root(value));
			const rows = byProject.get(id);
			if (rows) rows.push(value);
			else byProject.set(id, [value]);
		}
		groups = available.map((value) => {
			const id: SessionSidebarGroupId = `project:${value.id}`;
			const rows = (byProject.get(value.id) || []).sort((a, b) =>
				(b.active || b.created) - (a.active || a.created)
				|| b.created - a.created || b.id.localeCompare(a.id)
			).slice(0, RECENT_CHANNELS).map((value) => row(value, hello.user, hello.host));
			return {
				id,
				label: value.host === hello.host ? value.name : `${value.name} · ${value.host}`,
				rows,
				sort: "none",
				collapsed: collapsed[id],
			};
		});
	}

	function chooseProject(id: string) {
		setAll(id === ALL_PROJECTS);
		if (id === ALL_PROJECTS) return setPage("channels");
		setProject(id);
	}

	function select(value: Pick<Listing, "id" | "host" | "project" | "root">) {
		const id = projectId(value.host, root(value));
		setProject(id);
		if (!allProjects) setAll(false);
		setSelected((previous) => ({
			...previous,
			[id]: value.id,
			...(allProjects ? { [ALL_PROJECTS]: value.id } : {}),
		}));
		setPage("channels");
	}

	async function open(path: string) {
		const value = await host.request<Project>({ op: "project-open", path });
		chooseProject(projectId(hello.host, value.path));
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
			if (text) {
				try {
					await host.channel(value.id, { op: "ask", author: hello.user, text });
				} catch (error) {
					setDraft({ channel: value.id, text });
					toast.error("Could not invoke agent", {
						description: (error as Error).message,
						action: { label: "Settings", onClick: () => setSettings(true) },
					});
				}
			}
			onCreated?.();
			select({ ...value, host: hello.host });
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

	async function archiveInactive(project: string) {
		try {
			const count = await host.request<number>({ op: "archive-inactive", project });
			toast(
				count
					? `Archived ${count} inactive channel${count === 1 ? "" : "s"}`
					: "No inactive channels",
			);
		} catch (error) {
			toast.error("Could not archive channels", { description: (error as Error).message });
		}
	}

	async function rename(name: string) {
		if (!renaming) return;
		await host.channel(renaming.id, { op: "rename", author: hello.user, name: name.trim() });
		setRenaming(undefined);
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
							github={people[hello.user]}
							onPage={setPage}
							onSettings={() => setSettings(true)}
						/>
					}
				>
					<Drawers page={page} channel={channel?.id} />
					<WindowControls
						onOpen={() => void choose()}
						onSettings={() => setSettings(true)}
						onPage={setPage}
						connected={connected}
					/>
					{page !== "dashboard" && current && (
						<Sidebar
							side="left"
							className="-my-2 h-[calc(100%+1rem)]"
							innerClassName="h-full min-h-0"
						>
							{page === "channels"
								? (
									<ChannelsSidebar
										className="min-h-0 w-full min-w-0 flex-1 bg-transparent"
										projectName={allProjects ? "All Projects" : current.name}
										repos={repos}
										selectedRepoId={allProjects ? ALL_PROJECTS : current.id}
										groups={groups}
										selectedUid={channel?.id}
										loading={status === "connecting" && !channels.length}
										onRepoChange={(repo) => chooseProject(repo.id)}
										onAddRepo={connected ? () => void choose() : undefined}
										onSelect={(item) => {
											const value = listings.get(item.uid);
											if (value) select(value);
										}}
										onNewSession={!allProjects && local && connected
											? () => void create()
											: undefined}
										onRename={connected
											? (item) => setRenaming({ id: item.uid, name: item.name })
											: undefined}
										onToggleGroup={(id) =>
											setCollapsed((value) => ({ ...value, [id]: !value[id] }))}
										onArchive={(allProjects || local) && connected
											? (item) =>
												void change({
													op: "archive",
													channel: item.uid,
													archived: item.lifecycle !== "archived",
												})
											: undefined}
										onArchiveInactive={!allProjects && local && connected
											? () => void archiveInactive(current.path)
											: undefined}
										onDelete={!allProjects && local && connected
											? (item) => void change({ op: "delete", channel: item.uid })
											: undefined}
										empty={
											<p className="px-4 py-6 text-xs text-muted-foreground">
												{allProjects
													? "No recent channels across your projects."
													: "No channels in this project yet."}
											</p>
										}
									/>
								)
								: (
									<GithubSidebar
										kind={page}
										project={current}
										repos={repos}
										connected={connected}
										onProject={chooseProject}
										onOpen={() => void choose()}
									/>
								)}
						</Sidebar>
					)}
					<Main
						className={(page === "channels" && channel) || page === "issues" || page === "prs"
							? "overflow-hidden bg-background"
							: "overflow-y-auto bg-background"}
					>
						{deployed && status === "connecting" && !channels.length && (
							<p role="status" className="border-b px-4 py-2 text-xs text-muted-foreground">
								Connecting to{" "}
								{chosen}… If your browser asks to reach devices on your local network, allow it.
							</p>
						)}
						{status === "closed" && (
							<p role="status" className="border-b px-4 py-2 text-xs text-muted-foreground">
								<Disconnected />
							</p>
						)}
						{!current && !connected
							? null
							: !current
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
									onProject={chooseProject}
									onOpen={() => void choose()}
									onChannel={select}
									onCreate={create}
								/>
							)
							: page === "issues" || page === "prs"
							? (
								<Github
									key={`${current.id}:${page}`}
									kind={page}
									project={current}
									connected={connected}
									onCreate={local ? create : undefined}
								/>
							)
							: channel
							? (
								<Channel
									key={channel.id}
									channel={channel}
									user={hello.user}
									remote={channel.host !== hello.host}
									draft={draft}
									onDraftLoaded={() => setDraft(undefined)}
									onSettings={() => setSettings(true)}
								/>
							)
							: (
								<div className="flex min-h-full flex-col items-center justify-center gap-4 px-5 py-10 text-center">
									<IconHash className="size-6 text-muted-foreground" aria-hidden />
									<h1 className="text-base font-medium">
										{allProjects
											? "Choose a channel from any project"
											: `Choose a channel in ${current.name}`}
									</h1>
									{allProjects && (
										<p className="text-sm text-muted-foreground">
											Select a project to start a new channel.
										</p>
									)}
									{!allProjects && local && (
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
					{page === "channels" && channel && <ChannelDetails channel={channel} user={hello.user} />}
				</Layout>
				{adding && <OpenProject onOpen={open} onClose={() => setAdding(false)} />}
				{renaming && (
					<Rename
						open
						name={renaming.name}
						title="Rename channel"
						label="Channel name"
						description="Use lowercase letters, numbers, and hyphens, up to 63 characters."
						maxLength={63}
						pattern="[a-z0-9][a-z0-9\-]{0,62}"
						required
						onSave={rename}
						onCancel={() => setRenaming(undefined)}
					/>
				)}
				{settings && (
					<Settings
						key={String(settings)}
						initialSection={settings === "updates" ? "updates" : undefined}
						onClose={() => setSettings(false)}
					/>
				)}
				{desktop && <UpdateNotice onOpen={() => window.dispatchEvent(new Event("ace:updates"))} />}
				<Toaster />
			</TooltipProvider>
		</ThemeProvider>
	);
}
