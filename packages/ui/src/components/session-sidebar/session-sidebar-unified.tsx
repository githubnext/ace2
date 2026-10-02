import { SessionOptions } from "./session-options";
const EMPTY_REPOS: SessionSidebarRepoToggle[] = [];

import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import { useId, useMemo } from "react";
import * as format from "../../lib/format";
import { AnimatePresence, m as motion, useReducedMotion } from "motion/react";

import { SessionItem } from "../session-item/session-item";
import { SessionItemLoading } from "../session-item/session-item-loading";
import type { SidebarRow } from "../session-item/session-item.types";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { Button } from "../../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Skeleton } from "../../ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { isSidebarRowSelected } from "./selection";
import type { SessionSidebarRepo } from "./session-sidebar";
import { IconArchive, IconChevronDown, IconEye, IconPlus, IconX } from "../../icons";

export type SessionSidebarUnifiedGroupId = "pinned" | "mine" | "team" | "archived";

export type SessionSidebarUnifiedRepoSection = {
	repo: SessionSidebarRepo;
	rows: SidebarRow[];
};

export type SessionSidebarUnifiedGroup = {
	id: SessionSidebarUnifiedGroupId;
	label: string;
	collapsed?: boolean;
	repos: SessionSidebarUnifiedRepoSection[];
};

export type SessionSidebarRepoToggle = {
	repo: SessionSidebarRepo;
	visible: boolean;
};

export type SessionSidebarUnifiedProps =
	& Omit<ComponentPropsWithRef<"aside">, "children" | "onSelect">
	& {
		groups: SessionSidebarUnifiedGroup[];
		repos?: SessionSidebarRepoToggle[];
		loading?: boolean;
		selectedUid?: SidebarRow["uid"];
		onSelect?: (row: SidebarRow) => void;
		onPin?: (row: SidebarRow) => void;
		onUnpin?: (row: SidebarRow) => void;
		onArchive?: (row: SidebarRow) => void;
		onFork?: (row: SidebarRow) => void;
		onInfo?: (row: SidebarRow) => void;
		onLeave?: (row: SidebarRow) => void;
		onDelete?: (row: SidebarRow) => void;
		onRename?: (row: SidebarRow) => void;
		onToggleGroup?: (id: SessionSidebarUnifiedGroupId) => void;
		onToggleRepo?: (repo: SessionSidebarRepo) => void;
		onRemoveRepo?: (repo: SessionSidebarRepo) => void;
		onAddRepo?: () => void;
		/** Per-repo "New session" (only offered on My Sessions repo headers). */
		onNewSession?: (repo: SessionSidebarRepo) => void;
		/** When provided, a "…" menu button offers "Continue a pull request…". */
		onContinuePr?: (repo: SessionSidebarRepo) => void;
		/** When provided, the "…" menu offers "Start from an issue…". */
		onStartIssue?: (repo: SessionSidebarRepo) => void;
		empty?: ReactNode;
	};

const CHEVRON_TRANSITION = { duration: 0.15, ease: "easeOut" as const };
const CHEVRON_TRANSITION_REDUCED = { duration: 0, ease: "easeOut" as const };
const GROUP_TRANSITION = { duration: 0.18, ease: "easeOut" as const };
const GROUP_TRANSITION_REDUCED = { duration: 0, ease: "easeOut" as const };

const ACTION_BUTTON_CLASS =
	"size-5.5 border border-transparent bg-clip-padding text-muted-foreground shadow-none hover:border-[var(--edge)] hover:bg-background/50 hover:text-sidebar-foreground hover:shadow-[0_1px_2px_rgb(0_0_0/0.08)] hover:backdrop-blur-[1px] focus-visible:border-[var(--edge)] focus-visible:bg-background/50 focus-visible:text-sidebar-foreground focus-visible:shadow-[0_1px_2px_rgb(0_0_0/0.08)] focus-visible:backdrop-blur-[1px] dark:hover:border-black/20 dark:hover:bg-background/50 dark:focus-visible:border-black/20 dark:focus-visible:bg-background/50";

function count(groups: SessionSidebarUnifiedGroup[]) {
	let total = 0;
	for (let group of groups) {
		for (let section of group.repos) total += section.rows.length;
	}
	return total;
}

function byCreation(a: SidebarRow, b: SidebarRow) {
	return b.createdAt - a.createdAt || b.uid.localeCompare(a.uid);
}

function rowKey(row: SidebarRow) {
	return row.renderKey ?? row.uid;
}

function fallback(name: string) {
	return name.slice(0, 2).toUpperCase();
}

function byOrg(repos: SessionSidebarRepoToggle[]) {
	let groups = new Map<string, SessionSidebarRepoToggle[]>();
	for (let toggle of repos) {
		let list = groups.get(toggle.repo.org);
		if (list) list.push(toggle);
		else groups.set(toggle.repo.org, [toggle]);
	}
	return [...groups];
}

function RepoAvatar({ repo, className }: { repo: SessionSidebarRepo; className?: string }) {
	return (
		<Avatar className={cn("size-4 bg-transparent ring-0", className)}>
			<AvatarImage src={repo.avatar ?? format.avatar(repo.org)} alt={repo.org} />
			<AvatarFallback>{fallback(repo.org)}</AvatarFallback>
		</Avatar>
	);
}

function RepoToggleRow({ toggle, onToggleRepo, onRemoveRepo }: {
	toggle: SessionSidebarRepoToggle;
	onToggleRepo?: (repo: SessionSidebarRepo) => void;
	onRemoveRepo?: (repo: SessionSidebarRepo) => void;
}) {
	function toggleVisible() {
		onToggleRepo?.(toggle.repo);
	}

	function remove(event: MouseEvent<HTMLButtonElement>) {
		event.preventDefault();
		event.stopPropagation();
		onRemoveRepo?.(toggle.repo);
	}

	return (
		<div className="group/repo flex items-center gap-0.5 rounded-md squircle pr-1.5 hover:bg-muted/50">
			<button
				type="button"
				aria-label={toggle.visible ? `Hide ${toggle.repo.name}` : `Show ${toggle.repo.name}`}
				aria-pressed={toggle.visible}
				onClick={toggleVisible}
				className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs/relaxed outline-2 outline-offset-[-1px] outline-transparent focus-visible:outline-ring/50"
			>
				<RepoAvatar repo={toggle.repo} className={cn(!toggle.visible && "opacity-40")} />
				<span
					className={cn(
						"min-w-0 flex-1 truncate font-medium",
						!toggle.visible && "text-muted-foreground",
					)}
				>
					{toggle.repo.name}
				</span>
				<IconEye
					aria-hidden
					className={cn(
						"size-3.5 shrink-0 transition-opacity duration-150",
						toggle.visible
							? "text-foreground/70"
							: "text-muted-foreground/40 group-hover/repo:text-muted-foreground/70",
					)}
				/>
			</button>
			{onRemoveRepo && (
				<Tooltip>
					<TooltipTrigger
						render={
							<button
								type="button"
								aria-label={`Remove ${toggle.repo.name}`}
								className="grid size-5 shrink-0 place-items-center rounded-md squircle text-muted-foreground opacity-0 outline-2 outline-offset-[-1px] outline-transparent transition-[background-color,color,opacity] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground focus-visible:bg-foreground/10 focus-visible:text-foreground focus-visible:opacity-100 focus-visible:outline-ring/50 group-hover/repo:opacity-100"
								onClick={remove}
							/>
						}
					>
						<IconX className="size-3" />
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={6}>
						Remove
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}

function RepositoriesPicker(
	{ repos = EMPTY_REPOS, onToggleRepo, onRemoveRepo, onAddRepo }: {
		repos?: SessionSidebarRepoToggle[];
		onToggleRepo?: (repo: SessionSidebarRepo) => void;
		onRemoveRepo?: (repo: SessionSidebarRepo) => void;
		onAddRepo?: () => void;
	},
) {
	let orgGroups = useMemo(() => byOrg(repos), [repos]);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						className="-ml-1 h-7 w-[calc(100%+6px)] min-w-0 max-w-none justify-start gap-1.5 py-0 pr-2 pl-1.5 text-sidebar-foreground hover:bg-background/50 aria-expanded:bg-background/50"
						aria-label="Repositories"
					/>
				}
			>
				<span className="min-w-0 truncate text-xs/relaxed font-medium">Repositories</span>
				<IconChevronDown
					strokeWidth={3.3}
					className="ml-auto size-2.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out motion-reduce:transition-none group-data-[popup-open]/button:rotate-180"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={6} className="max-h-[400px] inline-[200px]">
				{onAddRepo && (
					<>
						<DropdownMenuItem className="mt-0 mb-1" onClick={onAddRepo}>
							<IconPlus className="size-3.5 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate">Add repository</span>
						</DropdownMenuItem>
						{orgGroups.length > 0 && <DropdownMenuSeparator className="my-0.5" />}
					</>
				)}
				{orgGroups.map(([org, list], index) => (
					<DropdownMenuGroup
						key={org}
						className={index === orgGroups.length - 1 ? "mb-0.5" : undefined}
					>
						{index > 0 && <DropdownMenuSeparator className="my-1.5" />}
						<DropdownMenuLabel className="py-1 pr-2 pl-2">
							<span className="truncate">{org}</span>
						</DropdownMenuLabel>
						{list.map((toggle) => (
							<RepoToggleRow
								key={toggle.repo.id}
								toggle={toggle}
								onToggleRepo={onToggleRepo}
								onRemoveRepo={onRemoveRepo}
							/>
						))}
					</DropdownMenuGroup>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function RepoHeader(
	{ repo, onNewSession, onContinuePr, onStartIssue }: {
		repo: SessionSidebarRepo;
		onNewSession?: (repo: SessionSidebarRepo) => void;
		onContinuePr?: (repo: SessionSidebarRepo) => void;
		onStartIssue?: (repo: SessionSidebarRepo) => void;
	},
) {
	return (
		<div className="flex h-6.5 items-center gap-1.5 pr-1 pl-[9px] text-xs font-medium text-muted-foreground">
			<RepoAvatar repo={repo} className="size-3.5" />
			<span className="min-w-0 truncate">
				<span className="text-muted-foreground/60">{repo.org}/</span>
				<span className="text-sidebar-foreground/80">{repo.name}</span>
			</span>
			{onNewSession && (
				<div className="ml-auto flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									size="icon-sm"
									variant="ghost"
									className={ACTION_BUTTON_CLASS}
									aria-label={`New session in ${repo.org}/${repo.name}`}
									onClick={() => onNewSession(repo)}
								>
									<IconPlus className="size-3.5" />
								</Button>
							}
						/>
						<TooltipContent side="right">New session</TooltipContent>
					</Tooltip>
					<SessionOptions
						className={ACTION_BUTTON_CLASS}
						onContinuePr={onContinuePr
							? () => onContinuePr(repo)
							: undefined}
						onStartIssue={onStartIssue
							? () => onStartIssue(repo)
							: undefined}
					/>
				</div>
			)}
		</div>
	);
}

function RepoSection({
	section,
	pinned,
	archived,
	showActions,
	selectedUid,
	onSelect,
	onPin,
	onUnpin,
	onArchive,
	onFork,
	onInfo,
	onLeave,
	onDelete,
	onRename,
	onNewSession,
	onContinuePr,
	onStartIssue,
}: {
	section: SessionSidebarUnifiedRepoSection;
	pinned: boolean;
	archived: boolean;
	showActions: boolean;
	selectedUid?: SidebarRow["uid"];
	onSelect?: (row: SidebarRow) => void;
	onPin?: (row: SidebarRow) => void;
	onUnpin?: (row: SidebarRow) => void;
	onArchive?: (row: SidebarRow) => void;
	onFork?: (row: SidebarRow) => void;
	onInfo?: (row: SidebarRow) => void;
	onLeave?: (row: SidebarRow) => void;
	onDelete?: (row: SidebarRow) => void;
	onRename?: (row: SidebarRow) => void;
	onNewSession?: (repo: SessionSidebarRepo) => void;
	onContinuePr?: (repo: SessionSidebarRepo) => void;
	onStartIssue?: (repo: SessionSidebarRepo) => void;
}) {
	let rows = useMemo(() => pinned ? section.rows : [...section.rows].sort(byCreation), [
		section.rows,
		pinned,
	]);

	return (
		<div className="pb-1">
			<RepoHeader
				repo={section.repo}
				onNewSession={showActions ? onNewSession : undefined}
				onContinuePr={showActions ? onContinuePr : undefined}
				onStartIssue={showActions ? onStartIssue : undefined}
			/>
			<div className="pt-0.5">
				{rows.map((row) =>
					row.lifecycle === "creating"
						? (
							<SessionItemLoading
								key={rowKey(row)}
								settled={Boolean(row.creating?.settled)}
								sessionName={row.name}
								selected={isSidebarRowSelected(row, selectedUid)}
							/>
						)
						: (
							<SessionItem
								key={rowKey(row)}
								data={row}
								selected={isSidebarRowSelected(row, selectedUid)}
								pinned={pinned}
								onPin={archived ? undefined : onPin}
								onUnpin={onUnpin}
								onArchive={onArchive}
								onFork={onFork}
								onInfo={onInfo}
								onLeave={onLeave}
								onDelete={onDelete}
								onRename={onRename}
								onClick={() => onSelect?.(row)}
							/>
						)
				)}
			</div>
		</div>
	);
}

function Group({
	group,
	selectedUid,
	onSelect,
	onPin,
	onUnpin,
	onArchive,
	onFork,
	onInfo,
	onLeave,
	onDelete,
	onRename,
	onToggleGroup,
	onNewSession,
	onContinuePr,
	onStartIssue,
}:
	& Pick<
		SessionSidebarUnifiedProps,
		| "selectedUid"
		| "onSelect"
		| "onPin"
		| "onUnpin"
		| "onArchive"
		| "onFork"
		| "onInfo"
		| "onLeave"
		| "onDelete"
		| "onRename"
		| "onToggleGroup"
		| "onNewSession"
		| "onContinuePr"
		| "onStartIssue"
	>
	& { group: SessionSidebarUnifiedGroup })
{
	let pinned = group.id === "pinned";
	let archived = group.id === "archived";
	let showActions = group.id === "mine";
	let collapsed = Boolean(group.collapsed);
	let content = useId();
	let reduced = useReducedMotion();

	return (
		<motion.section
			layout="position"
			transition={reduced ? GROUP_TRANSITION_REDUCED : GROUP_TRANSITION}
			data-group={group.id}
			className={cn("relative min-w-0", archived && "opacity-70")}
		>
			<div className="ml-[5px] mr-[3px] flex h-7 w-[calc(100%-8px)] items-center gap-1 rounded-md pr-1 pl-[9px] text-xs font-medium text-muted-foreground">
				<button
					type="button"
					aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.label}`}
					aria-expanded={!collapsed}
					aria-controls={content}
					onClick={() => onToggleGroup?.(group.id)}
					className="group/header flex h-full min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-2 outline-offset-0 outline-transparent transition-colors duration-150 focus-visible:outline-ring/50"
				>
					{archived && <IconArchive aria-hidden className="size-3.5 shrink-0" />}
					<span className="min-w-0 truncate">{group.label}</span>
					<motion.span
						aria-hidden
						initial={false}
						animate={{ rotate: collapsed ? -90 : 0 }}
						transition={reduced ? CHEVRON_TRANSITION_REDUCED : CHEVRON_TRANSITION}
						className="grid size-2.5 shrink-0 place-items-center opacity-0 transition-opacity duration-150 ease-out group-hover/header:opacity-70 group-focus-visible/header:opacity-70"
					>
						<IconChevronDown strokeWidth={3.3} className="size-2.5" />
					</motion.span>
				</button>
			</div>
			<AnimatePresence initial={false} mode="popLayout">
				{!collapsed && (
					<motion.div
						key="rows"
						id={content}
						layout="position"
						initial={reduced ? false : { opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={reduced ? GROUP_TRANSITION_REDUCED : GROUP_TRANSITION}
						className="overflow-hidden"
					>
						<div className="px-1.5 pt-1 pb-1">
							{group.repos.map((section) => (
								<RepoSection
									key={section.repo.id}
									section={section}
									pinned={pinned}
									archived={archived}
									showActions={showActions}
									selectedUid={selectedUid}
									onSelect={onSelect}
									onPin={onPin}
									onUnpin={onUnpin}
									onArchive={onArchive}
									onFork={onFork}
									onInfo={onInfo}
									onLeave={onLeave}
									onDelete={onDelete}
									onRename={onRename}
									onNewSession={onNewSession}
									onContinuePr={onContinuePr}
									onStartIssue={onStartIssue}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.section>
	);
}

function LoadingRows() {
	let placeholder = "bg-sidebar-accent/80 dark:bg-sidebar-accent";
	return (
		<div aria-label="Loading sessions" aria-busy="true" className="flex flex-col gap-3 pt-2">
			{[0, 1].map((group) => (
				<section key={group}>
					<div className="flex h-7 items-center px-2 pt-1.5 pl-3.5">
						<Skeleton className={cn("h-3 w-20", placeholder)} />
					</div>
					<div className="flex h-6 items-center px-2 pl-4">
						<Skeleton className={cn("h-2.5 w-28", placeholder)} />
					</div>
					<div className="pt-1 pr-1.5 pb-1 pl-2.5">
						{[0, 1].map((row) => (
							<div key={row} className="flex h-8 items-center gap-1 px-1 -my-0.5">
								<Skeleton className={cn("size-4 shrink-0 rounded-sm", placeholder)} />
								<Skeleton className={cn("h-4 min-w-0 max-w-40 flex-1", placeholder)} />
							</div>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

function DefaultEmpty({ onAddRepo }: { onAddRepo?: () => void }) {
	return (
		<div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
			<div className="text-sm font-medium text-sidebar-foreground">No repositories yet</div>
			{onAddRepo && <Button size="sm" onClick={onAddRepo}>Add repository</Button>}
		</div>
	);
}

export function SessionSidebarUnified(
	{
		groups,
		repos,
		loading,
		selectedUid,
		onSelect,
		onPin,
		onUnpin,
		onArchive,
		onFork,
		onInfo,
		onLeave,
		onDelete,
		onRename,
		onToggleGroup,
		onToggleRepo,
		onRemoveRepo,
		onAddRepo,
		onNewSession,
		onContinuePr,
		onStartIssue,
		empty,
		className,
		ref,
		...props
	}: SessionSidebarUnifiedProps,
) {
	let total = count(groups);
	let visible = groups.filter((group) => group.repos.length > 0);

	return (
		<TooltipProvider>
			<aside
				ref={ref}
				className={cn(
					"flex h-full w-64 min-w-56 flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
					className,
				)}
				{...props}
			>
				<header className="flex h-10.5 shrink-0 items-center border-b border-border/60 pr-2 pl-3 dark:border-transparent">
					<div className="flex min-w-0 flex-1 translate-y-0.5 items-center">
						<RepositoriesPicker
							repos={repos}
							onToggleRepo={onToggleRepo}
							onRemoveRepo={onRemoveRepo}
							onAddRepo={onAddRepo}
						/>
					</div>
				</header>
				<motion.div
					layoutScroll
					className="scrollbar-muted scroll-fade min-h-0 flex-1 scrollbar-thumb-[color-mix(in_oklch,var(--color-sidebar),black_28%)] dark:scrollbar-thumb-[color-mix(in_oklch,var(--color-sidebar),white_15%)]"
				>
					{loading
						? <LoadingRows />
						: total === 0 && visible.length === 0
						? (empty ?? <DefaultEmpty onAddRepo={onAddRepo} />)
						: (
							visible.map((group) => (
								<Group
									key={group.id}
									group={group}
									selectedUid={selectedUid}
									onSelect={onSelect}
									onPin={onPin}
									onUnpin={onUnpin}
									onArchive={onArchive}
									onFork={onFork}
									onInfo={onInfo}
									onLeave={onLeave}
									onDelete={onDelete}
									onRename={onRename}
									onToggleGroup={onToggleGroup}
									onNewSession={onNewSession}
									onContinuePr={onContinuePr}
									onStartIssue={onStartIssue}
								/>
							))
						)}
				</motion.div>
			</aside>
		</TooltipProvider>
	);
}
