import { useEffect, useEffectEvent } from "react";

import type { GithubKind } from "@ace/channel/protocol";

export type GithubTarget = {
	repo: string;
	kind: GithubKind;
	number: number;
	url: string;
	view: "discussion" | "files";
	anchor: string;
};

function githubLink(href: string): GithubTarget | undefined {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return;
	}
	if (url.hostname !== "github.com" || !["https:", "http:"].includes(url.protocol)) return;
	const match =
		/^\/([a-z\d][a-z\d-]*\/[a-z\d_.-]+)\/(pull|issues)\/([1-9]\d*)(?:\/(files|commits|checks))?\/?$/i
			.exec(url.pathname);
	if (!match) return;
	const number = Number(match[3]);
	if (!Number.isSafeInteger(number)) return;
	const kind = match[2]!.toLowerCase() === "pull" ? "prs" : "issues";
	return {
		repo: match[1]!,
		kind,
		number,
		url: `https://github.com/${match[1]}/${kind === "prs" ? "pull" : "issues"}/${number}`,
		view: kind === "prs" && (match[4]?.toLowerCase() === "files" || url.hash.startsWith("#diff-"))
			? "files"
			: "discussion",
		anchor: url.hash,
	};
}

/** Capture before the timeline's link handler, including links rendered through portals. */
export function GithubLinks({ onOpen }: { onOpen: (target: GithubTarget) => void }) {
	const open = useEffectEvent(onOpen);
	useEffect(() => {
		function click(event: MouseEvent) {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (!(event.target instanceof Element)) return;
			const link = event.target.closest<HTMLAnchorElement>("a[href]");
			if (!link || link.hasAttribute("data-ace-external") || link.hasAttribute("download")) return;
			const target = githubLink(link.href);
			if (!target) return;
			event.preventDefault();
			open(target);
		}
		document.addEventListener("click", click, true);
		return () => document.removeEventListener("click", click, true);
	}, []);
	return null;
}
