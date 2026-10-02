import { type ComponentPropsWithRef, useEffect, useState } from "react";
import type { FileContents } from "@pierre/diffs";
import { File } from "@pierre/diffs/react";

import { cachedFile, fileOptions, highlightFile } from "../../lib/highlighter";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";

import { FilePath } from "../file-path/file-path";
import { FileTree } from "../file-tree/file-tree";
import { IconFileTree, IconLoader } from "../../icons";

type FileViewProps = Omit<ComponentPropsWithRef<"section">, "children"> & {
	path: string;
	source?: string;
	pending?: boolean;
	error?: string;
	treePaths?: string[];
	treePending?: boolean;
	onFileSelect?: (path: string, option?: Select) => void;
};

type Select = {
	tab?: boolean;
};

function contents(path: string, source: string): FileContents {
	return { name: path, contents: source };
}

function useFile(path: string, source: string | undefined, pending: boolean) {
	let [state, setState] = useState<
		{
			path: string;
			source: string;
			html: string;
		} | null
	>(() => {
		if (source === undefined) return null;
		let file = contents(path, source);
		let html = cachedFile(file);
		return html ? { path, source, html } : null;
	});

	useEffect(() => {
		if (source === undefined) return;
		let cancelled = false;
		let file = contents(path, source);
		highlightFile(file).then(html => {
			if (!cancelled) {
				setState(prev =>
					prev?.path === path && prev.source === source && prev.html === html
						? prev
						: { path, source, html }
				);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [path, source]);

	let file = source === undefined
		? pending && state
			? contents(state.path, state.source)
			: undefined
		: contents(path, source);
	let html = source === undefined
		? pending && state
			? state.html
			: undefined
		: state?.path === path && state.source === source
		? state.html
		: file
		? cachedFile(file)
		: undefined;
	return { file, html };
}

function FileContent(
	{ path, source, pending = false, error }: Pick<
		FileViewProps,
		"path" | "source" | "pending" | "error"
	>,
) {
	let { file, html } = useFile(path, source, pending);
	let loading = pending && !file;
	let empty = !loading && !error && source === undefined && !file;
	return (loading
		? (
			<div
				className="grid h-full min-h-32 place-items-center text-muted-foreground"
				role="status"
				aria-label={`Loading ${path}`}
			>
				<IconLoader className="size-4 animate-spin" aria-hidden />
			</div>
		)
		: error || empty
		? (
			<div className="grid h-full min-h-32 place-items-center px-4 text-center text-sm text-muted-foreground">
				{error ?? "No file selected"}
			</div>
		)
		: file
		? (
			<File
				file={file}
				className="min-h-full min-w-full scheme-light select-text dark:scheme-dark"
				options={fileOptions()}
				prerenderedHTML={html}
			/>
		)
		: null);
}

function FileBrowser(
	{ path, treePaths, treePending, onFileSelect }: Pick<
		FileViewProps,
		"path" | "treePaths" | "treePending" | "onFileSelect"
	>,
) {
	return (treePending && !treePaths?.length
		? (
			<div
				className="grid h-full min-h-32 place-items-center text-muted-foreground"
				role="status"
				aria-label="Loading file tree"
			>
				<IconLoader className="size-4 animate-spin" aria-hidden />
			</div>
		)
		: treePaths?.length
		? (
			<FileTree
				paths={treePaths}
				selected={path}
				onSelect={next => onFileSelect?.(next)}
				onOpenTab={next => onFileSelect?.(next, { tab: true })}
			/>
		)
		: (
			<div className="grid h-full min-h-32 place-items-center px-4 text-center text-sm text-muted-foreground">
				No files
			</div>
		));
}

function FileView(
	{
		path,
		source,
		pending = false,
		error,
		treePaths,
		treePending = false,
		onFileSelect,
		className,
		ref,
		...props
	}: FileViewProps,
) {
	let [tree, setTree] = useState(() => !path);
	let hasTree = treePaths !== undefined || treePending;
	let open = tree && hasTree;

	return (
		<section
			ref={ref}
			className={cn(
				"flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground",
				className,
			)}
			{...props}
		>
			<header className="flex h-8 shrink-0 items-center gap-2 border-b border-border pr-1 pl-3">
				<div className="min-w-0 flex-1">
					<FilePath path={path || "Browse"} />
				</div>
				{hasTree && (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={tree ? "Hide file tree" : "Show file tree"}
									aria-pressed={tree}
									onClick={() => setTree(open => !open)}
								>
									<IconFileTree aria-hidden />
								</Button>
							}
						/>
						<TooltipContent>{tree ? "Hide file tree" : "Show file tree"}</TooltipContent>
					</Tooltip>
				)}
			</header>
			<div
				className={cn(
					"grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_0rem]",
					open && "grid-cols-[minmax(0,1fr)_16rem]",
				)}
			>
				<div
					className="min-h-0 overflow-auto bg-code/35 select-text"
					aria-busy={pending || undefined}
				>
					<FileContent path={path} source={source} pending={pending} error={error} />
				</div>
				<aside
					className="min-h-0 overflow-hidden border-l border-transparent bg-popover/60 opacity-0 data-[open=true]:border-border data-[open=true]:opacity-100"
					data-open={open ? true : undefined}
					aria-hidden={!open}
					inert={!open ? true : undefined}
				>
					{open && (
						<FileBrowser
							path={path}
							treePaths={treePaths}
							treePending={treePending}
							onFileSelect={onFileSelect}
						/>
					)}
				</aside>
			</div>
		</section>
	);
}

export { FileView };
export type { FileViewProps };
