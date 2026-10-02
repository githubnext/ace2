import {
	ARTIFACT_PREVIEW,
	ARTIFACT_ROW,
	CARD_GAP,
	FILE_HEADER,
	FILE_HEADER_PAD_Y,
	FILE_PREVIEW,
	FILE_ROW,
	SHOW_MORE_HEIGHT,
} from "./layout";

import type { Artifact, EditedFile } from "../../lib/timeline";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { buttonVariants } from "../../lib/button-variants";
import {
	IconChevronDownMicro,
	IconExternal,
	IconFileDiff,
	IconFileText,
	IconHash,
	IconIssue,
	IconMessage,
	IconPullRequest,
} from "../../icons";

const VM_PROJECT_PREFIX = "/workspace/project/";

type TurnSummaryProps = {
	id: string;
	artifacts: Artifact[];
	files: EditedFile[];
	artifactsExpanded: boolean;
	filesExpanded: boolean;
	onToggleArtifacts: () => void;
	onToggleFiles: () => void;
	onFileOpen?: (file: string) => void;
	onEditedFileOpen?: (file: string) => void;
	onLink?: (href: string) => void;
	onReviewChanges?: () => void;
};

function TurnSummary({
	id,
	artifacts,
	files,
	artifactsExpanded,
	filesExpanded,
	onToggleArtifacts,
	onToggleFiles,
	onFileOpen,
	onEditedFileOpen,
	onLink,
	onReviewChanges,
}: TurnSummaryProps) {
	return (
		<div className="flex min-w-0 flex-col" style={{ gap: CARD_GAP }}>
			{artifacts.length > 0 && (
				<ArtifactCard
					id={`${id}-artifacts`}
					artifacts={artifacts}
					expanded={artifactsExpanded}
					onToggle={onToggleArtifacts}
					onFileOpen={onFileOpen}
					onLink={onLink}
				/>
			)}
			{files.length > 0 && (
				<EditedFilesCard
					id={`${id}-files`}
					files={files}
					expanded={filesExpanded}
					onToggle={onToggleFiles}
					onFileOpen={onEditedFileOpen ?? onFileOpen}
					onReviewChanges={onReviewChanges}
				/>
			)}
		</div>
	);
}

function ArtifactCard({
	id,
	artifacts,
	expanded,
	onToggle,
	onFileOpen,
	onLink,
}: {
	id: string;
	artifacts: Artifact[];
	expanded: boolean;
	onToggle: () => void;
	onFileOpen?: (file: string) => void;
	onLink?: (href: string) => void;
}) {
	let visible = expanded ? artifacts : artifacts.slice(0, ARTIFACT_PREVIEW);
	let extra = artifacts.length - ARTIFACT_PREVIEW;

	return (
		<div className="flex min-w-0 flex-col items-center">
			<section
				aria-label="Generated artifacts"
				className="w-full overflow-hidden rounded-lg squircle border border-border bg-background"
			>
				{visible.map((artifact, index) => (
					<ArtifactRow
						key={artifact.url || artifact.path || `${artifact.kind}-${artifact.title}`}
						artifact={artifact}
						separated={index > 0}
						height={ARTIFACT_ROW}
						onFileOpen={onFileOpen}
						onLink={onLink}
					/>
				))}
				{extra > 0 && (
					<ShowMore
						id={id}
						count={extra}
						label="artifact"
						expanded={expanded}
						onToggle={onToggle}
					/>
				)}
			</section>
		</div>
	);
}

function ArtifactRow({
	artifact,
	separated,
	height,
	onFileOpen,
	onLink,
}: {
	artifact: Artifact;
	separated: boolean;
	height: number;
	onFileOpen?: (file: string) => void;
	onLink?: (href: string) => void;
}) {
	let Icon = artifactIcon(artifact);
	let actionable = Boolean(artifact.url || artifact.path && onFileOpen);
	let actionLabel = "Open";
	let content = (
		<>
			<span className="flex shrink-0 items-center justify-center rounded-sm bg-muted p-2.5 text-muted-foreground">
				<Icon className="size-4" aria-hidden />
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="block truncate text-xs text-muted-foreground">{artifact.meta}</span>
				<span className="block truncate text-sm font-medium text-foreground">{artifact.title}</span>
			</span>
			{actionable && (
				<span className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none gap-1.5")}>
					{actionLabel}
					{artifact.url && <IconExternal className="size-3.5 text-muted-foreground" aria-hidden />}
				</span>
			)}
		</>
	);
	let classes = cn(
		"flex w-full min-w-0 items-center gap-3 px-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring/50 motion-reduce:transition-none",
		"hover:bg-muted/50",
		separated && "border-t border-border",
	);
	let style = { blockSize: height, boxSizing: "border-box" as const };

	if (artifact.url) {
		if (onLink) {
			return (
				<button
					type="button"
					className={classes}
					style={style}
					onClick={() => onLink(artifact.url!)}
				>
					{content}
				</button>
			);
		}

		return (
			<a
				href={artifact.url}
				target="_blank"
				rel="noopener noreferrer"
				className={classes}
				style={style}
			>
				{content}
			</a>
		);
	}

	if (artifact.path && onFileOpen) {
		return (
			<button
				type="button"
				className={classes}
				style={style}
				onClick={() => onFileOpen(artifact.path!)}
			>
				{content}
			</button>
		);
	}

	return (
		<div className={classes} style={style}>
			{content}
		</div>
	);
}

function artifactIcon(artifact: Artifact) {
	switch (artifact.kind) {
		case "issue":
			return IconIssue;
		case "pull-request":
			return IconPullRequest;
		case "comment":
			return IconMessage;
		case "label":
			return IconHash;
		case "document":
			return IconFileText;
	}
}

function EditedFilesCard({
	id,
	files,
	expanded,
	onToggle,
	onFileOpen,
	onReviewChanges,
}: {
	id: string;
	files: EditedFile[];
	expanded: boolean;
	onToggle: () => void;
	onFileOpen?: (file: string) => void;
	onReviewChanges?: () => void;
}) {
	let visible = expanded ? files : files.slice(0, FILE_PREVIEW);
	let extra = files.length - FILE_PREVIEW;
	let adds = sum(files, "adds");
	let dels = sum(files, "dels");
	let hasStats = adds > 0 || dels > 0;

	return (
		<div className="flex min-w-0 flex-col items-center">
			<section
				aria-label="Edited files"
				className="w-full overflow-hidden rounded-lg squircle border border-border bg-background"
			>
				<div
					className="flex min-w-0 items-center gap-2.5 pl-3 pr-2.5"
					style={{
						blockSize: FILE_HEADER,
						boxSizing: "border-box",
						paddingBlock: FILE_HEADER_PAD_Y,
					}}
				>
					<span className="flex size-4.5 shrink-0 items-center justify-center text-muted-foreground">
						<IconFileDiff className="size-4" aria-hidden />
					</span>
					<span className="min-w-0 flex-1">
						<span className="flex min-w-0 items-baseline gap-2">
							<span className="truncate text-sm font-medium text-foreground">
								Edited {files.length} {files.length === 1 ? "file" : "files"}
							</span>
							{hasStats && (
								<span className="shrink-0 text-sm tabular-nums">
									<span className="text-accent">+{adds}</span>{" "}
									<span className="text-destructive">-{dels}</span>
								</span>
							)}
						</span>
					</span>
					{onReviewChanges && (
						<Button
							type="button"
							variant="outline"
							onClick={onReviewChanges}
						>
							Review
						</Button>
					)}
				</div>
				<div className="border-t border-border">
					{visible.map(file => (
						<FileRow
							key={file.path}
							file={file}
							height={FILE_ROW}
							onFileOpen={onFileOpen}
						/>
					))}
				</div>
				{extra > 0 && (
					<ShowMore
						id={id}
						count={extra}
						label="file"
						expanded={expanded}
						onToggle={onToggle}
					/>
				)}
			</section>
		</div>
	);
}

function FileRow({
	file,
	height,
	onFileOpen,
}: {
	file: EditedFile;
	height: number;
	onFileOpen?: (file: string) => void;
}) {
	let stats = file.adds != null || file.dels != null;
	let label = displayPath(file.path);
	let content = (
		<>
			<span className="min-w-0 flex-1 truncate text-sm text-foreground">{label}</span>
			{stats && (
				<span className="shrink-0 text-sm tabular-nums">
					<span className="text-accent">+{file.adds ?? 0}</span>{" "}
					<span className="text-destructive">-{file.dels ?? 0}</span>
				</span>
			)}
		</>
	);
	let classes = cn(
		"flex w-full min-w-0 items-center gap-3 px-[14px] text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring/50 motion-reduce:transition-none",
		"hover:bg-muted/50",
	);
	let style = { blockSize: height, boxSizing: "border-box" as const };

	if (!onFileOpen) return <div className={classes} style={style}>{content}</div>;
	return (
		<button
			type="button"
			title={label}
			className={classes}
			style={style}
			onClick={() => onFileOpen(file.path)}
		>
			{content}
		</button>
	);
}

function displayPath(path: string): string {
	return path.startsWith(VM_PROJECT_PREFIX) ? path.slice(VM_PROJECT_PREFIX.length) : path;
}

function ShowMore({
	id,
	count,
	label,
	expanded,
	onToggle,
}: {
	id: string;
	count: number;
	label: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	let text = expanded ? "Show less" : `Show ${count} more ${label}${count === 1 ? "" : "s"}`;

	return (
		<button
			id={id}
			type="button"
			aria-expanded={expanded}
			className="flex w-full items-center justify-center gap-1.5 border-t border-border text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring/50 motion-reduce:transition-none"
			style={{ blockSize: SHOW_MORE_HEIGHT, boxSizing: "border-box" }}
			onClick={onToggle}
		>
			{text}
			<IconChevronDownMicro
				className={cn(
					"size-3.5 shrink-0 origin-center transition-transform duration-200 ease-out motion-reduce:transition-none",
					expanded && "rotate-180",
				)}
				aria-hidden
			/>
		</button>
	);
}

function sum(files: EditedFile[], key: "adds" | "dels"): number {
	let value = 0;
	for (let file of files) value += file[key] ?? 0;
	return value;
}

export { TurnSummary };
