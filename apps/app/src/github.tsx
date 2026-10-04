import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";

import type {
	GithubDetail,
	GithubFile,
	GithubFilter,
	GithubItem,
	GithubKind,
	GithubList,
} from "@ace/channel/protocol";
import type { HostRequest } from "@ace/host/protocol";
import {
	Button,
	DiffView,
	type Event,
	Input,
	ProjectPicker,
	type SessionSidebarRepo,
	Timeline,
} from "@ace/ui";
import {
	IconChevronDown,
	IconChevronRight,
	IconCircleCheck,
	IconExternal,
	IconIssue,
	IconLoader,
	IconMerge,
	IconPullRequest,
	IconPullRequestClosed,
	IconRotate,
	IconSearch,
} from "@ace/ui/icons";

import type { GithubTarget } from "./github-link";
import { host } from "./host";
import type { AppProject } from "./projects";

const NAMES = { issues: "Issues", prs: "Pull requests" };
const REVIEWS = {
	approved: "Approved",
	changes_requested: "Requested changes",
	commented: "Reviewed",
	dismissed: "Review dismissed",
};
const DATE = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

type Query<T> = { value?: T; error?: string; loading: boolean; refresh: () => void };
type Filter = { state: GithubFilter; search: string; limit: number };

const ICONS = {
	issues: { open: IconIssue, closed: IconCircleCheck, merged: IconMerge, draft: IconIssue },
	prs: {
		open: IconPullRequest,
		closed: IconPullRequestClosed,
		merged: IconMerge,
		draft: IconPullRequest,
	},
};
const COLORS = {
	issues: {
		open: "text-accent",
		closed: "text-merged",
		merged: "text-merged",
		draft: "text-muted-foreground",
	},
	prs: {
		open: "text-accent",
		closed: "text-destructive",
		merged: "text-merged",
		draft: "text-muted-foreground",
	},
};

/** Keep loaded data during refreshes; a superseded request can never replace the current view. */
function useGithub<T>(request?: HostRequest): Query<T> {
	const status = useSyncExternalStore(host.subscribe, () => host.status);
	const [revision, setRevision] = useState(0);
	const [result, setResult] = useState<
		{ request: string; key: string; value?: T; error?: string }
	>();
	const source = request && JSON.stringify(request);
	const key = `${source}:${revision}`;
	useEffect(() => {
		if (!source || status !== "open") return;
		let live = true;
		host.request<T>(JSON.parse(source) as HostRequest).then(
			(value) => {
				if (live) setResult({ request: source, key, value });
			},
			(error: Error) => {
				if (!live) return;
				setResult((previous) => ({
					request: source,
					key,
					value: previous?.request === source ? previous.value : undefined,
					error: error.message,
				}));
			},
		);
		return () => {
			live = false;
		};
	}, [source, key, status]);
	useEffect(() => {
		if (!source) return;
		const refresh = () => {
			if (document.visibilityState === "visible") setRevision((value) => value + 1);
		};
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, [source]);
	return {
		value: result?.request === source ? result?.value : undefined,
		error: status !== "open"
			? "Connect to your host to load GitHub."
			: result?.key === key
			? result.error
			: undefined,
		loading: !!source && status === "open" && result?.key !== key,
		refresh: () => setRevision((value) => value + 1),
	};
}

function StateIcon({ item }: { item: Pick<GithubItem, "kind" | "state"> }) {
	const Icon = ICONS[item.kind][item.state];
	const color = COLORS[item.kind][item.state];
	return <Icon className={`size-4 shrink-0 ${color}`} aria-hidden />;
}

function Notice({ error, loading, empty, onRetry }: {
	error?: string;
	loading?: boolean;
	empty: string;
	onRetry: () => void;
}) {
	return (
		<div
			className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center text-sm text-muted-foreground"
			role={error ? "alert" : "status"}
		>
			{loading && !error && <IconLoader className="size-5 animate-spin" aria-hidden />}
			<p>{error || (loading ? "Loading from GitHub…" : empty)}</p>
			{error && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
		</div>
	);
}

function Refresh({ loading, onClick }: { loading: boolean; onClick: () => void }) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Refresh from GitHub"
			disabled={loading}
			onClick={onClick}
		>
			<IconRotate className={loading ? "animate-spin" : ""} aria-hidden />
		</Button>
	);
}

function Labels({ labels }: Pick<GithubItem, "labels">) {
	return labels.map((label) => (
		<span
			key={label.name}
			className="inline-flex max-w-48 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
		>
			<span
				className="size-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: `#${label.color}` }}
			/>
			<span className="truncate">{label.name}</span>
		</span>
	));
}

function Items({ items }: Pick<GithubList, "items">) {
	return (
		<ul className="divide-y divide-border">
			{items.map((item) => (
				<li key={item.number}>
					<a
						href={item.url}
						className="flex items-start gap-3 px-4 py-4 outline-none hover:bg-muted/40 focus-visible:bg-muted/60 sm:px-6"
					>
						<span className="pt-0.5">
							<StateIcon item={item} />
						</span>
						<span className="flex min-w-0 flex-1 flex-col gap-1.5">
							<span className="text-sm font-medium text-pretty">{item.title}</span>
							<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
								<span>#{item.number}</span>
								<span className="capitalize">{item.state}</span>
								<span>by {item.author}</span>
								<span>· Updated {DATE.format(new Date(item.updated))}</span>
							</span>
							{item.labels.length > 0 && (
								<span className="flex flex-wrap gap-1">
									<Labels labels={item.labels} />
								</span>
							)}
						</span>
						<IconChevronRight
							className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							aria-hidden
						/>
					</a>
				</li>
			))}
		</ul>
	);
}

function discussion(item: GithubDetail): Event[] {
	const entries = [
		{
			id: "description",
			author: item.author,
			body: item.body || "No description provided.",
			created: item.created,
		},
		...item.comments.map((comment) => ({
			...comment,
			body: comment.review ? `**${REVIEWS[comment.review]}**\n\n${comment.body}` : comment.body,
		})),
	];
	return entries.map((entry) => ({
		id: `${item.url}:${entry.id}`,
		uid: entry.id,
		type: "message",
		topic: item.url,
		created_at: Math.floor(Date.parse(entry.created) / 1000),
		sender: { kind: "user", value: entry.author, display: entry.author },
		content: [{ type: "text", text: entry.body }],
	}));
}

function DetailHeader({ item, target, onTarget, id }: {
	item: GithubDetail;
	target: GithubTarget;
	onTarget: (target: GithubTarget) => void;
	id: string;
}) {
	return (
		<header className="shrink-0 border-b px-4 pt-5 sm:px-6">
			<h2 className="text-lg font-medium text-pretty">
				{item.title} <span className="text-muted-foreground">#{item.number}</span>
			</h2>
			<div className="mt-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<StateIcon item={item} />
					<span className="capitalize">{item.state}</span>
				</span>
				<span>{item.author} opened on {DATE.format(new Date(item.created))}</span>
				{item.pull && (
					<span className="break-all">
						<code>{item.pull.head}</code> → <code>{item.pull.base}</code>
					</span>
				)}
				<Labels labels={item.labels} />
			</div>
			{item.pull && (
				<div
					className="flex gap-4 text-xs"
					role="tablist"
					aria-label="Pull request views"
					onKeyDown={(event) => {
						if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
						event.preventDefault();
						const view = event.key === "Home" ? "discussion" : event.key === "End"
							? "files"
							: target.view === "files"
							? "discussion"
							: "files";
						onTarget({ ...target, view, anchor: "" });
						document.getElementById(`${id}-${view}`)?.focus();
					}}
				>
					{(["discussion", "files"] as const).map((view) => (
						<button
							key={view}
							type="button"
							role="tab"
							id={`${id}-${view}`}
							aria-controls={`${id}-panel`}
							aria-selected={target.view === view}
							tabIndex={target.view === view ? 0 : -1}
							className={`border-b-2 px-1 pb-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
								target.view === view
									? "border-accent text-foreground"
									: "border-transparent text-muted-foreground"
							}`}
							onClick={() => onTarget({ ...target, view, anchor: "" })}
						>
							{view === "discussion" ? "Discussion" : (
								<>
									Files changed{" "}
									<span className="ml-1 text-muted-foreground">{item.pull!.files}</span>
									<span className="ml-3 text-accent">+{item.pull!.adds}</span>
									<span className="ml-1 text-destructive">−{item.pull!.dels}</span>
								</>
							)}
						</button>
					))}
				</div>
			)}
		</header>
	);
}

function Files(
	{ data, pull }: { data: Query<GithubFile[]>; pull: NonNullable<GithubDetail["pull"]> },
) {
	if (!data.value) {
		return (
			<Notice
				error={data.error}
				loading={data.loading}
				empty="No changed files."
				onRetry={data.refresh}
			/>
		);
	}
	return (
		<>
			{data.error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{data.error}
			</p>}
			<DiffView
				files={data.value}
				base={pull.base}
				head={pull.head}
				className="min-h-0 flex-1 rounded-none border-0"
			/>
		</>
	);
}

function DetailBody({ item, target, files, id }: {
	item: GithubDetail;
	target: GithubTarget;
	files: Query<GithubFile[]>;
	id: string;
}) {
	const events = useMemo(() => discussion(item), [item]);
	const comment = item.comments.find((comment) =>
		target.anchor && comment.url.endsWith(target.anchor)
	);
	return (
		<div
			className="flex min-h-0 flex-1 flex-col"
			id={`${id}-panel`}
			role={item.pull ? "tabpanel" : undefined}
			aria-labelledby={item.pull ? `${id}-${target.view}` : undefined}
		>
			{target.view === "files" && item.pull
				? <Files data={files} pull={item.pull} />
				: (
					<Timeline
						className="min-h-0 flex-1"
						events={events}
						toolbar={false}
						target={comment?.id || "description"}
					/>
				)}
		</div>
	);
}

function Detail({ target, onTarget }: {
	target: GithubTarget;
	onTarget: (target?: GithubTarget) => void;
}) {
	const id = useId();
	const data = useGithub<GithubDetail>({
		op: "github-detail",
		repo: target.repo,
		kind: target.kind,
		number: target.number,
	});
	const files = useGithub<GithubFile[]>(
		target.view === "files"
			? { op: "github-files", repo: target.repo, number: target.number }
			: undefined,
	);
	const item = data.value;
	function refresh() {
		data.refresh();
		files.refresh();
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-5">
				<Button variant="ghost" size="sm" onClick={() => onTarget(undefined)}>
					<IconChevronRight className="rotate-180" aria-hidden />
					{NAMES[target.kind]}
				</Button>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{target.repo} #{target.number}
				</span>
				<Refresh loading={data.loading || files.loading} onClick={refresh} />
				<a
					href={`${target.url}${target.view === "files" ? "/files" : ""}${target.anchor}`}
					data-ace-external
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
					aria-label="Open in GitHub"
				>
					<IconExternal className="size-3.5" aria-hidden />
					<span className="hidden sm:inline">Open in GitHub</span>
				</a>
			</div>
			{!item
				? (
					<Notice
						error={data.error}
						loading={data.loading}
						empty="No GitHub item found."
						onRetry={refresh}
					/>
				)
				: (
					<>
						<DetailHeader item={item} target={target} onTarget={onTarget} id={id} />
						{data.error && (
							<p role="alert" className="px-4 py-2 text-xs text-destructive">{data.error}</p>
						)}
						<DetailBody item={item} target={target} files={files} id={id} />
					</>
				)}
		</div>
	);
}

function Results({ kind, repo, data, filter, onFilter, onRetry }: {
	kind: GithubKind;
	repo: Query<string | null>;
	data: Query<GithubList>;
	filter: Filter;
	onFilter: (filter: Filter) => void;
	onRetry: () => void;
}) {
	const error = repo.error || data.error;
	const loading = repo.loading || data.loading;
	if (!repo.value) {
		return (
			<Notice
				error={error}
				loading={loading}
				empty="This project has no GitHub remote."
				onRetry={onRetry}
			/>
		);
	}
	if (!data.value?.items.length) {
		const state = filter.state === "all" ? "" : `${filter.state} `;
		const scope = filter.search ? " match your search" : " in this project";
		return (
			<Notice
				error={error}
				loading={loading}
				empty={`No ${state}${NAMES[kind].toLowerCase()}${scope}.`}
				onRetry={onRetry}
			/>
		);
	}
	return (
		<>
			{error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{error}</p>}
			<Items items={data.value.items} />
			{data.value.more && filter.limit < 1000 && (
				<div className="flex justify-center border-t p-4">
					<Button
						variant="outline"
						disabled={loading}
						onClick={() => onFilter({ ...filter, limit: Math.min(1000, filter.limit + 50) })}
					>
						Load more
					</Button>
				</div>
			)}
			{data.value.items.length === 1000 && (
				<p className="p-4 text-center text-xs text-muted-foreground">
					Showing the first 1,000 results. Search to narrow the list.
				</p>
			)}
		</>
	);
}

export function Github({ kind, project, repos, connected, target, onTarget, onProject, onOpen }: {
	kind: GithubKind;
	project: AppProject;
	repos: SessionSidebarRepo[];
	connected: boolean;
	target?: GithubTarget;
	onTarget: (target?: GithubTarget) => void;
	onProject: (id: string) => void;
	onOpen: () => void;
}) {
	const [filter, setFilter] = useState<Filter>({
		state: "open",
		search: "",
		limit: 50,
	});
	const [search, setSearch] = useState("");
	const repo = useGithub<string | null>(
		target ? undefined : { op: "project-repo", project: project.path, host: project.host },
	);
	const list = useGithub<GithubList>(
		repo.value && !target ? { op: "github-list", repo: repo.value, kind, ...filter } : undefined,
	);
	const loading = repo.loading || list.loading;
	function refresh() {
		repo.refresh();
		list.refresh();
	}
	return (
		<section className="flex h-full min-h-0 flex-col bg-background">
			<header className="flex shrink-0 items-center gap-4 border-b px-4 py-3 sm:px-6">
				<h1 className="text-sm font-medium">{NAMES[kind]}</h1>
				<ProjectPicker
					repos={repos}
					selectedRepoId={project.id}
					onRepoChange={(repo) => onProject(repo.id)}
					onAddRepo={connected ? onOpen : undefined}
					trigger={
						<button
							type="button"
							aria-label={`Select project, currently ${project.name}`}
							className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
						/>
					}
				>
					<span className="truncate">{project.name}</span>
					<IconChevronDown className="size-3 shrink-0" aria-hidden />
				</ProjectPicker>
			</header>
			{target
				? <Detail key={target.url} target={target} onTarget={onTarget} />
				: (
					<>
						<div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:px-6">
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-1" aria-label={`${NAMES[kind]} state`}>
									{(["open", "closed", "all"] as const).map((state) => (
										<Button
											key={state}
											variant={filter.state === state ? "secondary" : "ghost"}
											size="sm"
											aria-pressed={filter.state === state}
											onClick={() => setFilter({ ...filter, state, limit: 50 })}
										>
											{state[0]!.toUpperCase() + state.slice(1)}
										</Button>
									))}
								</div>
								<span className="ml-auto hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
									{repo.value}
								</span>
								<Refresh loading={loading} onClick={refresh} />
							</div>
							<form
								className="flex gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									setFilter({ ...filter, search: search.trim(), limit: 50 });
								}}
							>
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder={`Search ${NAMES[kind].toLowerCase()}…`}
									aria-label={`Search ${NAMES[kind].toLowerCase()}`}
								/>
								<Button type="submit" variant="outline" size="icon" aria-label="Search GitHub">
									<IconSearch aria-hidden />
								</Button>
							</form>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
							<Results
								kind={kind}
								repo={repo}
								data={list}
								filter={filter}
								onFilter={setFilter}
								onRetry={refresh}
							/>
						</div>
					</>
				)}
		</section>
	);
}
