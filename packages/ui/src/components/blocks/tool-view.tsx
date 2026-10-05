import { useEffect, useState } from "react";
import type { Block } from "../../lib/block";
import { cached, highlight } from "../../lib/highlighter";
import { iconFor } from "../../lib/tool-icon";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { SMALL_CODE_FONT, SMALL_LINE_HEIGHT } from "./constants";
import { useToolContext } from "./tool-context";
import {
	agentPreview,
	isSubagent,
	language,
	loadingStatus,
	RESULT_PAD_X,
	RESULT_PAD_Y,
	ROW_HEIGHT,
	titleFor,
	TOOL_TEXT_FONT,
	type ToolData,
} from "./tool-layout";
import { IconChevronRightMicro, IconCircleX } from "../../icons";
import "./tool.css";

type HighlightState = { source: string; lang?: string; html: string };

function ToolView(
	{ data, expanded, settling, height, clipped, diff, images, width }: {
		data: ToolData;
		expanded: boolean;
		settling: boolean;
		height: number;
		clipped: boolean;
		diff?: Block;
		images?: Block;
		width: number;
	},
) {
	let preview = agentPreview(data);
	let subagent = isSubagent(data);
	let open = expanded && Boolean(data.result || preview || images);
	let total = ROW_HEIGHT + (open ? height + (images?.measure(width).height || 0) : 0);

	return (
		<div className="overflow-hidden" style={{ blockSize: total }}>
			<ToolHeader data={data} expanded={expanded} settling={settling} open={open} />
			{open && height > 0 && (
				subagent && preview
					? <ToolAgentResult data={data} height={height} settling={settling} />
					: diff
					? (
						<ToolDiffResult
							block={diff}
							width={width}
							height={height}
							settling={settling}
							last={!images}
						/>
					)
					: <ToolResult data={data} height={height} clipped={clipped} settling={settling} />
			)}
			{open && images && (
				<div className={settling ? "tool-result-expand-out" : "tool-result-expand-in"}>
					{images.render(width)}
				</div>
			)}
		</div>
	);
}

function headerClass(interactive: boolean, open: boolean, error: boolean) {
	return cn(
		"flex items-center gap-1.5 border-x border-t border-transparent px-1.5 text-left text-sm text-muted-foreground transition-[background-color,border-color,color] duration-150 ease-out squircle contain-strict",
		interactive
			&& (
				error
					? "hover:bg-muted data-[state=open]:hover:bg-code data-[state=closing]:hover:bg-code"
					: "hover:bg-muted hover:text-foreground data-[state=open]:hover:bg-code data-[state=closing]:hover:bg-code"
			),
		open && "border-border bg-code",
		open ? "rounded-t-md" : "rounded-md",
		error && "text-destructive",
	);
}

function ToolLabel(
	{ data, expanded, settling, interactive }: {
		data: ToolData;
		expanded: boolean;
		settling: boolean;
		interactive: boolean;
	},
) {
	let Icon = iconFor(isSubagent(data) ? "subagent" : data.name);
	let title = titleFor(data);
	let loading = loadingStatus(data.status) || data.agent?.status === "pending"
		|| data.agent?.status === "running";
	let error = data.status === "error" || data.agent?.status === "error";
	return (
		<>
			<Icon className="size-4 text-muted-foreground shrink-0" />
			<span className={cn("min-w-0 truncate", loading && "text-shimmer")}>{title}</span>
			<span className="flex size-3 shrink-0 items-center justify-center">
				{interactive && (
					<IconChevronRightMicro
						className={cn(
							"size-3 shrink-0 origin-center rotate-0 text-muted-foreground transition-[rotate] duration-200 ease-out motion-reduce:transition-none",
							expanded && !settling && "rotate-90",
						)}
					/>
				)}
			</span>
			{error && (
				<IconCircleX
					aria-label="error"
					className="ml-auto size-3.5 shrink-0 text-destructive"
				/>
			)}
		</>
	);
}

function ToolHeader(
	{ data, expanded, settling, open }: {
		data: ToolData;
		expanded: boolean;
		settling: boolean;
		open: boolean;
	},
) {
	let context = useToolContext();
	let toggle = context?.toggle;
	let preview = agentPreview(data);
	let interactive = Boolean((data.result || preview || data.images?.length) && toggle);
	let title = titleFor(data);
	let error = data.status === "error" || data.agent?.status === "error";
	let cls = headerClass(interactive, open, error);

	return (
		<>
			{interactive
				? (
					<button
						type="button"
						onClick={() => toggle?.(data.id)}
						data-state={settling ? "closing" : expanded ? "open" : "closed"}
						aria-expanded={expanded && !settling}
						aria-label={title}
						className={cls}
						style={{ inlineSize: "100%", blockSize: ROW_HEIGHT, ...TOOL_TEXT_FONT }}
					>
						<ToolLabel
							data={data}
							expanded={expanded}
							settling={settling}
							interactive={interactive}
						/>
					</button>
				)
				: (
					<div
						className={cls}
						style={{ inlineSize: "100%", blockSize: ROW_HEIGHT, ...TOOL_TEXT_FONT }}
					>
						<ToolLabel
							data={data}
							expanded={expanded}
							settling={settling}
							interactive={interactive}
						/>
					</div>
				)}
		</>
	);
}

function numbered(result: string) {
	let lines = result.split("\n");
	let rows = lines.map(line => line.match(/^(\d+)\.\s?(.*)$/));
	if (rows.some(row => !row)) return null;
	let seen = new Map<string, number>();
	return {
		nums: rows.map(row => {
			let value = row![1]!;
			let key = `${value}-${seen.get(value) || 0}`;
			seen.set(value, (seen.get(value) || 0) + 1);
			return { key, value };
		}),
		source: rows.map(row => row![2]!).join("\n"),
	};
}

function ToolResult(
	{ data, height, clipped, settling }: {
		data: ToolData;
		height: number;
		clipped: boolean;
		settling: boolean;
	},
) {
	let result = data.result!;
	let nums = numbered(result);
	let source = nums?.source || result;
	let lang = language(data);
	let context = useToolContext();
	let title = titleFor(data);
	let [state, setState] = useState<HighlightState | null>(() => {
		let html = cached(source, lang);
		return html ? { source, lang, html } : null;
	});

	// Shiki highlighting is async: render plain text first, then swap in cached HTML when ready.
	useEffect(() => {
		let current = cached(source, lang);
		if (current) {
			setState(prev =>
				sameHighlight(prev, source, lang, current) ? prev : {
					source,
					lang,
					html: current,
				}
			);
			return;
		}

		let cancelled = false;
		highlight(source, lang).then(h => {
			if (cancelled) return;
			setState(prev => sameHighlight(prev, source, lang, h) ? prev : { source, lang, html: h });
		});
		return () => {
			cancelled = true;
		};
	}, [source, lang]);

	return (
		<div
			className={cn(
				"relative rounded-t-none squircle tab-4 overflow-hidden border-x border-b border-border bg-code contain-content",
				!data.images?.length && "rounded-b-md",
				settling ? "tool-result-expand-out" : "tool-result-expand-in",
			)}
			style={{
				blockSize: height,
				boxSizing: "border-box",
				font: SMALL_CODE_FONT,
				lineHeight: `${SMALL_LINE_HEIGHT}px`,
			}}
		>
			<div
				className="box-border h-full overflow-x-auto overflow-y-hidden select-text [&_*]:select-text [&_.shiki]:!m-0 [&_.shiki]:!rounded-t-none [&_.shiki]:!bg-transparent [&_.shiki]:!p-0 [&_.shiki]:!font-[inherit]"
				style={{
					padding: `${RESULT_PAD_Y}px ${RESULT_PAD_X}px`,
					whiteSpace: "pre",
				}}
			>
				<div className={cn(nums && "flex gap-3")}>
					{nums && (
						<div
							className="shrink-0 text-right text-muted-foreground/45 tabular-nums"
							style={{ userSelect: "none" }}
						>
							{nums.nums.map(num => (
								<div key={num.key} style={{ userSelect: "none" }}>{num.value}</div>
							))}
						</div>
					)}
					<div className={cn(nums && "min-w-max")}>
						{state && state.source === source && state.lang === lang
							? <div dangerouslySetInnerHTML={{ __html: state.html }} />
							: source}
					</div>
				</div>
			</div>
			{clipped && (
				<Button
					type="button"
					onClick={() => context?.toggleResult?.(data.id)}
					aria-label={`Show full output for ${title}`}
					variant="outline"
					size="sm"
					className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 bg-background font-sans"
				>
					Show more
				</Button>
			)}
		</div>
	);
}

function ToolAgentResult(
	{ data, height, settling }: {
		data: ToolData;
		height: number;
		settling: boolean;
	},
) {
	let preview = agentPreview(data) || "";
	return (
		<div
			className={cn(
				"relative rounded-t-none squircle tab-4 overflow-hidden border-x border-b border-border bg-code contain-content",
				!data.images?.length && "rounded-b-md",
				settling ? "tool-result-expand-out" : "tool-result-expand-in",
			)}
			style={{
				blockSize: height,
				boxSizing: "border-box",
				...TOOL_TEXT_FONT,
			}}
		>
			<div
				className="box-border h-full overflow-x-auto overflow-y-hidden select-text px-4 py-2 text-foreground"
				style={{ whiteSpace: "pre" }}
			>
				{preview}
			</div>
		</div>
	);
}

function sameHighlight(
	state: HighlightState | null,
	source: string,
	lang: string | undefined,
	html: string,
) {
	return state?.source === source && state.lang === lang && state.html === html;
}

function ToolDiffResult(
	{ block, height, width, settling, last }: {
		block: Block;
		height: number;
		width: number;
		settling: boolean;
		last: boolean;
	},
) {
	return (
		<div
			className={cn(
				"overflow-hidden contain-content [&>*]:rounded-t-none [&>*]:!border-t-0",
				!last && "[&>*]:rounded-b-none",
				settling ? "tool-result-expand-out" : "tool-result-expand-in",
			)}
			style={{
				blockSize: height,
				boxSizing: "border-box",
			}}
		>
			{block.render(width)}
		</div>
	);
}

export { ToolView };
