import { useEffect, useMemo, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";

import {
	cachedDiff,
	type DiffContents,
	diffOptions,
	type DiffOptionsOverride,
	type DiffStyle,
	highlightDiff,
	parseDiff,
} from "../../lib/highlighter";
import { cn } from "../../lib/utils";

type DiffProps = {
	/** Unified-diff patch text for a single file. */
	patch: string;
	className?: string;
	streaming?: boolean;
	height?: number;
	file?: FileDiffMetadata | null;
	oldFile?: DiffContents["oldFile"];
	newFile?: DiffContents["newFile"];
	view?: DiffStyle;
	virtualized?: boolean;
	hunkSeparators?: DiffOptionsOverride["hunkSeparators"];
};

const PRERENDER_LINE_LIMIT = 1200;

function metadataText(file: FileDiffMetadata) {
	if (file.type === "rename-pure") {
		return file.prevName ? `Renamed from ${file.prevName}` : "File renamed";
	}
	if (file.type === "new") return "Empty file added";
	if (file.type === "deleted") return "Empty file deleted";
	return "Only file metadata changed";
}

function useDiff(
	{
		patch,
		file,
		oldFile,
		newFile,
		view = "unified",
		virtualized = false,
		hunkSeparators,
		streaming,
	}: DiffProps,
) {
	let parsed = useMemo(
		() => file === undefined ? parseDiff(patch, { oldFile, newFile }) : file,
		[file, newFile, oldFile, patch],
	);
	let lines = parsed ? (view === "split" ? parsed.splitLineCount : parsed.unifiedLineCount) : 0;
	let metadata = parsed && parsed.hunks.length === 0 ? metadataText(parsed) : undefined;
	let prerender = !virtualized || lines <= PRERENDER_LINE_LIMIT;
	let overrides = useMemo(
		() => hunkSeparators ? { hunkSeparators } : undefined,
		[hunkSeparators],
	);
	let key = parsed?.cacheKey ?? patch;
	let cacheKey = `${key}\0${view}\0${hunkSeparators ?? ""}`;
	let [state, setState] = useState<{ key: string; html: string } | null>(() => {
		if (streaming || !prerender || metadata) return null;
		let html = cachedDiff(patch, view, parsed, overrides);
		return html ? { key: cacheKey, html } : null;
	});

	useEffect(() => {
		if (!parsed || metadata || streaming || !prerender) return;
		let cancelled = false;
		highlightDiff(patch, parsed, view, overrides).then(html => {
			if (!cancelled) setState({ key: cacheKey, html });
		});
		return () => {
			cancelled = true;
		};
	}, [cacheKey, patch, streaming, parsed, metadata, view, prerender, overrides]);
	let cached = !streaming && !metadata && prerender && state?.key !== cacheKey
		? cachedDiff(patch, view, parsed, overrides)
		: undefined;

	return {
		parsed,
		metadata,
		overrides,
		html: prerender && state?.key === cacheKey ? state.html : cached,
	};
}

/** Standalone diff viewer backed by @pierre/diffs. */
function Diff({
	patch,
	className,
	streaming = false,
	height,
	file,
	oldFile,
	newFile,
	view = "unified",
	virtualized = false,
	hunkSeparators,
}: DiffProps) {
	let { parsed, metadata, overrides, html } = useDiff({
		patch,
		file,
		oldFile,
		newFile,
		view,
		virtualized,
		hunkSeparators,
		streaming,
	});

	if (streaming) {
		return (
			<pre
				className={cn(
					"m-0 rounded-lg squircle scrollbar-none overflow-x-auto overflow-y-hidden border border-border bg-code px-3 pt-2 pb-0.5 font-mono text-xs leading-5 whitespace-pre select-text contain-content",
					className,
				)}
				style={{
					blockSize: height,
					boxSizing: "border-box",
				}}
			>
				{patch}
			</pre>
		);
	}

	if (!parsed) {
		return (
			<div
				className={cn(
					"rounded-lg squircle overflow-hidden border border-border bg-muted px-3 text-xs text-muted-foreground",
					height === undefined ? "py-2" : "pt-2 pb-0.5 leading-5",
					className,
				)}
				style={{
					blockSize: height,
					boxSizing: "border-box",
				}}
			>
				Invalid or empty patch
			</div>
		);
	}

	if (metadata) {
		return (
			<div
				className={cn(
					"rounded-lg squircle overflow-hidden border border-border bg-code px-3 text-xs text-muted-foreground",
					height === undefined
						? "grid min-h-16 place-items-center py-2"
						: "pt-2 pb-0.5 leading-5",
					className,
				)}
				style={{
					blockSize: height,
					boxSizing: "border-box",
				}}
			>
				{metadata}
			</div>
		);
	}

	return (
		<FileDiff
			fileDiff={parsed}
			className={cn(
				"rounded-lg squircle border border-border overflow-hidden scheme-light dark:scheme-dark",
				className,
			)}
			style={{
				blockSize: height,
				boxSizing: "border-box",
				overflow: "hidden",
			}}
			options={diffOptions(view, overrides)}
			prerenderedHTML={html}
		/>
	);
}

export { Diff };
export type { DiffProps };
