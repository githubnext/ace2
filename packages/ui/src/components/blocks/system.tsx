import type { Block } from "../../lib/block";
import { SYSTEM_HEIGHT } from "./constants";
import { ExecView, Link, SystemLine, Text } from "./system-view";
import {
	ACTION_HEIGHT,
	ACTION_PAD_X,
	execActions,
	OUTPUT,
	output,
	OUTPUT_LINE,
	OUTPUT_PAD,
	PREVIEW_HEIGHT,
} from "./system-layout";

/** System rows are a single fixed-height line that always fills available width. */
function systemMeasure(width: number) {
	return { height: SYSTEM_HEIGHT, fit: width };
}

/** Commit indicator block with fixed height. */
function commit(sha: string, message: string, href?: string): Block {
	return {
		measure: systemMeasure,
		render: () => (
			<SystemLine className="text-muted-foreground">
				<span className="shrink-0">Committed</span>
				<code className="shrink-0 text-xs text-foreground">
					<Link href={href}>{sha.slice(0, 7)}</Link>
				</code>
				<Text>{message}</Text>
			</SystemLine>
		),
	};
}

/** New pull request row. */
function pr(id: string, title: string, href?: string): Block {
	return {
		measure: systemMeasure,
		render: () => (
			<SystemLine className="text-muted-foreground">
				<span className="shrink-0">Opened PR</span>
				<Link href={href} className="font-medium text-foreground">{id}</Link>
				<Text>{title}</Text>
			</SystemLine>
		),
	};
}

/** Pull request state or title update row. */
function prUpdate(id: string, href?: string, value?: string, title?: string): Block {
	return {
		measure: systemMeasure,
		render: () =>
			value
				? (
					<SystemLine className="text-muted-foreground">
						<span className="shrink-0">PR</span>
						<Link href={href} className="font-medium text-foreground">{id}</Link>
						<Text>{value}</Text>
					</SystemLine>
				)
				: (
					<SystemLine className="text-muted-foreground">
						<span className="shrink-0">Updated PR</span>
						<Link href={href} className="font-medium text-foreground">{id}</Link>
						<Text>{title}</Text>
					</SystemLine>
				),
	};
}

/** GitHub pull request comment header. Markdown body renders as a following text block. */
function prComment(pr: string, author: string, url?: string, height = SYSTEM_HEIGHT): Block {
	return {
		measure: (width) => ({ height, fit: width }),
		render: () => (
			<SystemLine align="baseline" className="text-muted-foreground" height={height}>
				<span className="shrink-0 font-medium text-foreground">{author}</span>
				<span className="shrink-0">commented on PR</span>
				{url
					? (
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
						>
							{pr}
						</a>
					)
					: <span className="shrink-0 font-medium text-foreground">{pr}</span>}
			</SystemLine>
		),
	};
}

/** GitHub pull request review header. Markdown body renders as a following text block. */
function prReview(
	pr: string,
	action: "approved" | "commented" | "changes_requested" | "dismissed",
	reviewer: string,
	url?: string,
	height = SYSTEM_HEIGHT,
): Block {
	let verb = action === "approved"
		? "approved"
		: action === "changes_requested"
		? "requested changes on"
		: action === "dismissed"
		? "dismissed a review on"
		: "reviewed";
	return {
		measure: (width) => ({ height, fit: width }),
		render: () => (
			<SystemLine align="baseline" className="text-muted-foreground" height={height}>
				<span className="shrink-0 font-medium text-foreground">{reviewer}</span>
				<span className="shrink-0">{verb}</span>
				{url
					? (
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
						>
							{pr}
						</a>
					)
					: <span className="shrink-0 font-medium text-foreground">{pr}</span>}
			</SystemLine>
		),
	};
}

/** GitHub inline (code-line) review comment header. Body renders as a following text block. */
function prReviewComment(
	author: string,
	path: string,
	line?: number,
	url?: string,
	height = SYSTEM_HEIGHT,
): Block {
	let loc = line ? `${path}:${line}` : path;
	return {
		measure: (width) => ({ height, fit: width }),
		render: () => (
			<SystemLine align="baseline" className="text-muted-foreground" height={height}>
				<span className="shrink-0 font-medium text-foreground">{author}</span>
				<span className="shrink-0">commented on</span>
				{url
					? (
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline"
						>
							{loc}
						</a>
					)
					: <Text className="font-medium text-foreground">{loc}</Text>}
			</SystemLine>
		),
	};
}

/** Shared GitHub issue header ("{author} {verb} {#N}"). Body renders below. */
function issueLine(
	verb: string,
	issue: string,
	author: string,
	url?: string,
	height = SYSTEM_HEIGHT,
) {
	return (
		<SystemLine align="baseline" className="text-muted-foreground" height={height}>
			<span className="shrink-0 font-medium text-foreground">{author}</span>
			<span className="shrink-0">{verb}</span>
			{url
				? (
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
					>
						{issue}
					</a>
				)
				: <span className="shrink-0 font-medium text-foreground">{issue}</span>}
		</SystemLine>
	);
}

/** Entry-point issue opened. Title + markdown body render as a following text block. */
function issueOpened(issue: string, author: string, url?: string, height = SYSTEM_HEIGHT): Block {
	return {
		measure: (width) => ({ height, fit: width }),
		render: () => issueLine("opened issue", issue, author, url, height),
	};
}

/** GitHub issue comment header. Markdown body renders as a following text block. */
function issueComment(issue: string, author: string, url?: string, height = SYSTEM_HEIGHT): Block {
	return {
		measure: (width) => ({ height, fit: width }),
		render: () => issueLine("commented on issue", issue, author, url, height),
	};
}

/** Entry-point issue closed or reopened. Single fixed-height line. */
function issueUpdate(issue: string, url?: string, value?: "open" | "closed"): Block {
	let verb = value === "closed" ? "closed issue" : "reopened issue";
	return {
		measure: systemMeasure,
		render: () => (
			<SystemLine className="text-muted-foreground">
				<span className="shrink-0">{verb}</span>
				<Link href={url} className="font-medium text-foreground">{issue}</Link>
			</SystemLine>
		),
	};
}

/** Link rendered as a compact GitHub-style action button. */
function githubAction(label: string, href: string): Block {
	return {
		measure: (width) => ({
			height: ACTION_HEIGHT,
			fit: Math.min(width, Math.ceil(label.length * 7.5 + ACTION_PAD_X * 2)),
		}),
		render: () => (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex max-w-full items-center justify-center truncate rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
				style={{ blockSize: ACTION_HEIGHT }}
			>
				{label}
			</a>
		),
	};
}

/** Shell command execution row. */
function exec(
	id: string,
	input: string,
	exitCode?: number | string,
	aborted?: boolean,
	stdout = "",
	stderr = "",
	expanded = false,
	cwd?: string,
): Block {
	let pending = exitCode === undefined;
	let rows = output(input, stdout, stderr);
	let hasOutput = rows.length > 0;
	let actions = execActions({ hasOutput });
	let waiting = pending && rows.length === 0;
	let visible = waiting ? ["..."] : rows.slice(0, OUTPUT);
	let hidden = rows.length > visible.length;
	let preview = !expanded && rows.length > 0 ? rows[0]! : "";
	let lines = expanded ? visible.length + (hidden ? 1 : 0) : 0;
	let height = SYSTEM_HEIGHT
		+ (preview ? PREVIEW_HEIGHT : 0)
		+ (lines ? lines * OUTPUT_LINE + OUTPUT_PAD * 2 : 0);

	return {
		measure: (width) => ({
			height,
			fit: width,
		}),
		render: () => (
			<ExecView
				id={id}
				input={input}
				exitCode={exitCode}
				aborted={aborted}
				pending={pending}
				waiting={waiting}
				expanded={expanded}
				preview={preview}
				shown={visible}
				hidden={hidden}
				height={height}
				lines={lines}
				actions={actions}
				cwd={cwd}
				stdout={stdout}
				stderr={stderr}
			/>
		),
	};
}

/** User joined or left the channel. */
function presence(action: "join" | "leave", sender: string): Block {
	return {
		measure: systemMeasure,
		render: () =>
			action === "join"
				? (
					<SystemLine className="text-muted-foreground">
						<span className="shrink-0 font-medium text-foreground">{sender}</span>
						<Text>joined the session</Text>
					</SystemLine>
				)
				: (
					<SystemLine className="text-muted-foreground">
						<span className="shrink-0 font-medium text-foreground">{sender}</span>
						<Text>left the session</Text>
					</SystemLine>
				),
	};
}

/** Call started or ended. */
function call(action: "start" | "end", sender: string): Block {
	return {
		measure: systemMeasure,
		render: () =>
			action === "start"
				? (
					<SystemLine className="text-green-500">
						<Text>{sender} started a call</Text>
					</SystemLine>
				)
				: (
					<SystemLine className="text-muted-foreground">
						<Text>call ended</Text>
					</SystemLine>
				),
	};
}

export {
	call,
	commit,
	exec,
	execActions,
	githubAction,
	issueComment,
	issueOpened,
	issueUpdate,
	pr,
	prComment,
	presence,
	prReview,
	prReviewComment,
	prUpdate,
};
export {
	type ExecAction,
	type ExecActionHandler,
	type ExecActionPayload,
	execStatusSlot,
} from "./system-layout";
