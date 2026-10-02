import { type ComponentType, type ReactElement, type ReactNode, use } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";

import { SMALL_CODE_FONT, SYSTEM_HEIGHT } from "./constants";
import { useToolToggle } from "./tool-context";

import { ExecActionContext } from "./system-context";
import {
	type ExecAction,
	type ExecActionPayload,
	execStatusSlot,
	LABEL_INSET,
	OUTPUT_LINE,
	OUTPUT_PAD,
	PREVIEW_HEIGHT,
	TERMINAL_JOIN_PAD_Y,
	TERMINAL_PAD_X,
	TERMINAL_PAD_Y,
} from "./system-layout";
import {
	IconCircleCheck,
	IconCircleX,
	IconCopy,
	IconExpand,
	IconMessageForward,
	IconStop,
} from "../../icons";

type ExecActionItem = {
	action: ExecAction;
	label: string;
	tip: string;
	destructive?: boolean;
	icon: ComponentType<{ className?: string }>;
};

const ACTIONS: Record<ExecAction, ExecActionItem> = {
	view: {
		action: "view",
		label: "View output",
		tip: "View full output",
		icon: IconExpand,
	},
	copy: { action: "copy", label: "Copy output", tip: "Copy", icon: IconCopy },
	send: {
		action: "send",
		label: "Send to Ace",
		tip: "Send to Ace",
		icon: IconMessageForward,
	},
	abort: {
		action: "abort",
		label: "Stop command",
		tip: "Stop",
		destructive: true,
		icon: IconStop,
	},
};

function SystemLine(
	{ children, className, height = SYSTEM_HEIGHT, align = "center" }: {
		align?: "baseline" | "center";
		children: ReactNode;
		className?: string;
		height?: number;
	},
) {
	return (
		<div
			className={`flex min-w-0 items-center gap-1 overflow-hidden text-xs ${className || ""}`}
			style={{ alignItems: align, blockSize: height, paddingInlineStart: LABEL_INSET }}
		>
			{children}
		</div>
	);
}

function Text({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={`min-w-0 truncate ${className || ""}`}>{children}</span>;
}

function Link(
	{ children, href, className }: { children: ReactNode; href?: string; className?: string },
) {
	let classes = cn("shrink-0", className);
	return href
		? <a href={href} className={cn(classes, "underline-offset-2 hover:underline")}>{children}</a>
		: <span className={classes}>{children}</span>;
}

function ExecTooltip({ label, children }: { label: string; children: ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function ExecStatus({ payload }: { payload: ExecActionPayload }) {
	let { id, input, cwd, stdout, stderr, exitCode, aborted } = payload;
	let onAction = use(ExecActionContext);
	let pending = exitCode === undefined;
	let status = aborted
		? "aborted"
		: pending
		? "running"
		: exitCode === 0
		? "passed"
		: "failed";
	let slot = execStatusSlot({ aborted, exitCode });
	let StateIcon = slot === "passed"
		? IconCircleCheck
		: slot === "abort"
		? IconStop
		: IconCircleX;
	return slot === "abort"
		? onAction
			? (
				<ExecTooltip label={ACTIONS.abort.tip}>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={ACTIONS.abort.label}
						className="size-5 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
						onClick={(event) => {
							event.stopPropagation();
							onAction("abort", { id, input, cwd, stdout, stderr, exitCode, aborted });
						}}
					>
						<StateIcon className="size-3.5" aria-hidden />
					</Button>
				</ExecTooltip>
			)
			: null
		: (
			<ExecTooltip label={status[0]!.toUpperCase() + status.slice(1)}>
				<span
					aria-label={status}
					className={cn(
						"grid size-5 shrink-0 place-items-center",
						slot === "passed" ? "text-success" : "text-destructive",
					)}
				>
					<StateIcon className="size-4" aria-hidden />
				</span>
			</ExecTooltip>
		);
}

function ExecControls({ actions, payload }: { actions: ExecAction[]; payload: ExecActionPayload }) {
	let { id, input, cwd, stdout, stderr, exitCode, aborted } = payload;
	let onAction = use(ExecActionContext);
	if (!onAction && execStatusSlot(payload) === "abort") return null;
	let buttons = onAction && actions.length > 0
		? (
			<span className="flex shrink-0 items-center gap-0.5 transition-opacity duration-100 notouch:pointer-events-none notouch:opacity-0 notouch:group-hover:pointer-events-auto notouch:group-hover:opacity-100 notouch:group-focus-within:pointer-events-auto notouch:group-focus-within:opacity-100">
				{actions.map(name => {
					let item = ACTIONS[name];
					let Icon = item.icon;
					return (
						<ExecTooltip key={name} label={item.tip}>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label={item.label}
								className={cn(
									"size-5 text-muted-foreground hover:bg-background/70 hover:text-foreground",
									item.destructive
										&& "text-destructive hover:bg-destructive/10 hover:text-destructive",
								)}
								onClick={(event) => {
									event.stopPropagation();
									onAction(name, { id, input, cwd, stdout, stderr, exitCode, aborted });
								}}
							>
								<Icon className="size-3.5" aria-hidden />
							</Button>
						</ExecTooltip>
					);
				})}
			</span>
		)
		: null;
	return (
		<span className="ml-auto flex shrink-0 items-center gap-0.5">
			{buttons}
			<ExecStatus payload={payload} />
		</span>
	);
}

function ExecView(
	{
		id,
		input,
		exitCode,
		aborted,
		waiting,
		expanded,
		preview,
		shown,
		hidden,
		height,
		lines,
		actions,
		cwd,
		stdout,
		stderr,
	}: {
		id: string;
		input: string;
		exitCode?: number | string;
		aborted?: boolean;
		pending: boolean;
		waiting: boolean;
		expanded: boolean;
		preview: string;
		shown: string[];
		hidden: boolean;
		height: number;
		lines: number;
		actions: ExecAction[];
		cwd?: string;
		stdout: string;
		stderr: string;
	},
) {
	let toggle = useToolToggle();
	let canExpand = !aborted && shown.length > 0 && toggle !== null;
	let command = (
		<code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{input}</code>
	);
	let controls = (
		<ExecControls
			actions={actions}
			payload={{ id, input, cwd, stdout, stderr, exitCode, aborted }}
		/>
	);
	let lineStyle = {
		blockSize: SYSTEM_HEIGHT,
		paddingBlockEnd: TERMINAL_JOIN_PAD_Y,
		paddingBlockStart: TERMINAL_PAD_Y,
		paddingInline: TERMINAL_PAD_X,
	};
	let line = canExpand
		? (
			<div
				className="box-border flex w-full min-w-0 items-center gap-1.5"
				style={lineStyle}
			>
				<button
					type="button"
					onClick={() => toggle?.(id)}
					aria-expanded={expanded}
					aria-label={expanded ? "Hide command output" : "Show command output"}
					className={cn(
						"flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-sm bg-transparent text-left",
					)}
				>
					{command}
				</button>
				{controls}
			</div>
		)
		: (
			<div
				className="box-border flex w-full min-w-0 items-center gap-1.5"
				style={lineStyle}
			>
				{command}
				{controls}
			</div>
		);

	return (
		<TooltipProvider>
			<div
				className="group flex flex-col overflow-hidden text-xs"
				style={{ blockSize: height }}
			>
				<div
					className="min-w-0 overflow-hidden rounded-md bg-muted/60 select-text [&_*]:select-text"
					style={{ blockSize: height }}
				>
					{line}
					{preview && (
						<div
							className="box-border min-w-0 truncate font-mono text-xs text-muted-foreground"
							style={{
								blockSize: PREVIEW_HEIGHT,
								lineHeight: `${PREVIEW_HEIGHT - TERMINAL_PAD_Y - TERMINAL_JOIN_PAD_Y}px`,
								paddingBlockEnd: TERMINAL_PAD_Y,
								paddingBlockStart: TERMINAL_JOIN_PAD_Y,
								paddingInline: TERMINAL_PAD_X,
							}}
						>
							{preview}
						</div>
					)}
					{expanded && shown.length > 0 && (
						<pre
							className="m-0 box-border overflow-hidden whitespace-pre text-muted-foreground"
							style={{
								height: lines * OUTPUT_LINE + OUTPUT_PAD * 2,
								font: SMALL_CODE_FONT,
								lineHeight: `${OUTPUT_LINE}px`,
								paddingTop: OUTPUT_PAD,
								paddingBottom: OUTPUT_PAD,
								paddingInline: TERMINAL_PAD_X,
							}}
							aria-busy={waiting || undefined}
						>
							{shown.join("\n")}
							{hidden ? "\n..." : ""}
						</pre>
					)}
				</div>
			</div>
		</TooltipProvider>
	);
}

export { ExecView, Link, SystemLine, Text };
