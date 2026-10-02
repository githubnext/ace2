import { type ActionProps, canTogglePin, hasVisibleActions } from "./actions";
import type { MouseEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";

import { hitArea } from "../../lib/hit-area";
import { cn } from "../../lib/utils";
import { motion } from "../../ui/popup";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";

import type { SidebarRow } from "./session-item.types";
import {
	IconArchive as ArchiveContent2,
	IconExit as Leave,
	IconFork as Fork,
	IconInfo as Info,
	IconPencil as Pencil,
	IconPin as Pin,
	IconPinOff as PinSlash,
	IconRotate as Rebuild,
	IconTrash as Trash,
} from "../../icons";

const MENU_POPUP =
	"z-50 max-block-(--available-height) min-inline-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-(--r-popover) squircle bg-popover p-1 text-popover-foreground shadow-popover outline-none";
const MENU_POPUP_FULL = `${MENU_POPUP} ${motion}`;
const MENU_ITEM =
	"relative flex min-h-7 cursor-default items-center gap-2 rounded-md squircle px-2 py-1 text-xs/relaxed outline-hidden select-none focus:bg-secondary focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";
const MENU_ITEM_DESTRUCTIVE =
	"text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20";
const MENU_ITEM_DESTRUCTIVE_FULL = `${MENU_ITEM} ${MENU_ITEM_DESTRUCTIVE}`;
const ACTION_BUTTON = cn(
	hitArea,
	"grid size-6 place-items-center rounded-md squircle text-muted-foreground outline-2 outline-offset-[-1px] outline-transparent transition-[background-color,color,transform] duration-150 ease-out hover:bg-background/70 hover:text-foreground group-data-[primary=true]/menu:active:translate-y-px focus-visible:outline-ring/50",
);
const SESSION_ACTIONS =
	"absolute top-1/2 right-1 z-20 inline-flex -translate-y-1/2 items-center gap-0 -space-x-0.5 opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none pointer-events-none group-hover/row:pointer-events-auto group-focus-within/row:pointer-events-auto group-data-[menu-open=true]/menu:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-data-[menu-open=true]/menu:opacity-100";

type SessionActionsProps = ActionProps & {
	data: SidebarRow;
};

type RowMenuProps = {
	data: SidebarRow;
	onRename?: (data: SidebarRow) => void;
	onFork?: (data: SidebarRow) => void;
	onInfo?: (data: SidebarRow) => void;
	onLeave?: (data: SidebarRow) => void;
	onArchive?: (data: SidebarRow) => void;
	onDelete?: (data: SidebarRow) => void;
	onRebuild?: (data: SidebarRow) => void;
	children: ReactNode;
};

function stop(event: MouseEvent<HTMLElement>) {
	event.stopPropagation();
}

function ActionButton(
	{
		label,
		children,
		onClick,
	}: {
		label: string;
		children: ReactNode;
		onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	},
) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						aria-label={label}
						className={ACTION_BUTTON}
						onClick={onClick}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export function SessionActions(
	{
		data,
		pinned,
		onPin,
		onUnpin,
		onArchive,
	}: SessionActionsProps,
) {
	let canPin = canTogglePin({ pinned, onPin, onUnpin, onArchive });
	if (!hasVisibleActions({ pinned, onPin, onUnpin, onArchive })) return null;

	function pin(event: MouseEvent<HTMLButtonElement>) {
		stop(event);
		if (pinned) onUnpin?.(data);
		else onPin?.(data);
	}

	function archive(event: MouseEvent<HTMLElement>) {
		stop(event);
		onArchive?.(data);
	}

	return (
		<span className={SESSION_ACTIONS}>
			{canPin && (
				<ActionButton label={pinned ? "Unpin channel" : "Pin channel"} onClick={pin}>
					{pinned ? <PinSlash className="size-3.5" /> : <Pin className="size-3.5" />}
				</ActionButton>
			)}
			{onArchive && (
				<ActionButton label="Archive channel" onClick={archive}>
					<ArchiveContent2 className="size-3.5" />
				</ActionButton>
			)}
		</span>
	);
}

export function RowMenu(
	{ data, onRename, onFork, onInfo, onLeave, onArchive, onDelete, onRebuild, children }:
		RowMenuProps,
) {
	let anchor = useRef<HTMLDivElement>(null);
	let [open, setOpen] = useState(false);
	let [primary, setPrimary] = useState(true);
	let lobby = data.kind === "lobby";
	let archived = data.lifecycle === "archived";

	let leave = data.member ? onLeave : undefined;

	function rename(event: MouseEvent<HTMLElement>) {
		stop(event);
		onRename?.(data);
	}

	function fork(event: MouseEvent<HTMLElement>) {
		stop(event);
		onFork?.(data);
	}

	function info(event: MouseEvent<HTMLElement>) {
		stop(event);
		onInfo?.(data);
	}

	function exit(event: MouseEvent<HTMLElement>) {
		stop(event);
		leave?.(data);
	}

	function archive(event: MouseEvent<HTMLElement>) {
		stop(event);
		onArchive?.(data);
	}

	function del(event: MouseEvent<HTMLElement>) {
		stop(event);
		onDelete?.(data);
	}

	function rebuild(event: MouseEvent<HTMLElement>) {
		stop(event);
		onRebuild?.(data);
	}

	return (
		<ContextMenu.Root onOpenChange={setOpen}>
			<ContextMenu.Trigger
				render={
					<div
						ref={anchor}
						data-menu-open={open ? "true" : undefined}
						data-primary={primary}
						onPointerDownCapture={event => setPrimary(event.button === 0 && !event.ctrlKey)}
						onKeyDownCapture={() => setPrimary(true)}
						className="group/menu"
					/>
				}
			>
				{children}
			</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<ContextMenu.Positioner
					anchor={anchor}
					side="bottom"
					align="end"
					sideOffset={4}
					alignOffset={0}
					className="isolate z-50 outline-none"
				>
					<ContextMenu.Popup className={MENU_POPUP_FULL}>
						<ContextMenu.Group>
							{!lobby && !archived && (
								<>
									<ContextMenu.Item className={MENU_ITEM} disabled={!onRename} onClick={rename}>
										<Pencil className="size-3.5" />
										Rename channel
									</ContextMenu.Item>
									<ContextMenu.Item className={MENU_ITEM} disabled={!onFork} onClick={fork}>
										<Fork className="size-3.5" />
										Fork channel
									</ContextMenu.Item>
									<ContextMenu.Item className={MENU_ITEM} disabled={!onInfo} onClick={info}>
										<Info className="size-3.5" />
										Channel info
									</ContextMenu.Item>
									{data.member && (
										<ContextMenu.Item className={MENU_ITEM} disabled={!leave} onClick={exit}>
											<Leave className="size-3.5" />
											Leave channel
										</ContextMenu.Item>
									)}
									<ContextMenu.Item
										className={MENU_ITEM_DESTRUCTIVE_FULL}
										disabled={!onArchive}
										onClick={archive}
									>
										<ArchiveContent2 className="size-3.5" />
										Archive channel
									</ContextMenu.Item>
								</>
							)}
							{!lobby && archived && (
								<ContextMenu.Item
									className={MENU_ITEM_DESTRUCTIVE_FULL}
									disabled={!onDelete}
									onClick={del}
								>
									<Trash className="size-3.5" />
									Delete channel
								</ContextMenu.Item>
							)}
							{lobby && (
								<ContextMenu.Item
									className={MENU_ITEM_DESTRUCTIVE_FULL}
									disabled={!onRebuild}
									onClick={rebuild}
								>
									<Rebuild className="size-3.5" />
									Rebuild Lobby
								</ContextMenu.Item>
							)}
						</ContextMenu.Group>
					</ContextMenu.Popup>
				</ContextMenu.Positioner>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
}
