import {
	createElement,
	type CSSProperties,
	Fragment,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ComarkElement, ComarkNode } from "comark";

import { cached, highlight } from "../../lib/highlighter";

import {
	CODE_FONT,
	CODE_LABEL_HEIGHT as LABEL_HEIGHT,
	CODE_LINE_HEIGHT,
	CODE_PADDING,
} from "./constants";

function CodeView(
	{ source, language, streaming = false, nodes, height }: {
		source: string;
		language?: string;
		streaming?: boolean;
		nodes?: ComarkNode[];
		height?: number;
	},
) {
	let [state, setState] = useState<
		{
			source: string;
			language?: string;
			html: string;
		} | null
	>(() => {
		if (streaming || nodes) return null;
		let html = cached(source, language);
		return html ? { source, language, html } : null;
	});

	useEffect(() => {
		if (streaming || nodes) return;
		let cancelled = false;
		highlight(source, language).then(h => {
			if (!cancelled) setState({ source, language, html: h });
		});
		return () => {
			cancelled = true;
		};
	}, [source, language, streaming, nodes]);

	let html = !streaming && !nodes && state?.source === source && state.language === language
		? state.html
		: !streaming && !nodes
		? cached(source, language)
		: undefined;

	return (
		<div
			className={`rounded-lg squircle tab-4 scrollbar-none overflow-x-auto overflow-y-hidden bg-code select-text contain-strict [&_*]:select-text [&_.shiki]:!m-0 [&_.shiki]:!bg-transparent [&_.shiki]:!p-0 [&_.shiki]:!font-[inherit]${
				streaming ? " streaming-live" : ""
			}`}
			style={{
				blockSize: height,
				boxSizing: "border-box",
				font: CODE_FONT,
				lineHeight: `${CODE_LINE_HEIGHT}px`,
				marginInline: "calc(var(--code-outset, 0px) * -1)",
				padding: CODE_PADDING,
				whiteSpace: "pre",
			}}
		>
			{language && (
				<div
					className="text-muted-foreground"
					style={{
						blockSize: LABEL_HEIGHT,
						boxSizing: "border-box",
						fontSize: 12,
						lineHeight: "12px",
						overflow: "hidden",
						paddingBlockEnd: 4,
					}}
				>
					{language}
				</div>
			)}
			{nodes
				? <CodeNodes nodes={nodes} source={source} streaming={streaming} />
				: html
				? <div dangerouslySetInnerHTML={{ __html: html }} />
				: streaming
				? <CodeStream source={source} />
				: source}
		</div>
	);
}

function elem(node: ComarkNode): node is ComarkElement {
	return Array.isArray(node) && typeof node[0] === "string";
}

function style(raw: unknown): CSSProperties | undefined {
	if (typeof raw !== "string") return;
	let out: CSSProperties = {};
	for (let part of raw.split(";")) {
		let [key, value] = part.split(":");
		if (!key || !value) continue;
		let name = key.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
		(out as Record<string, string>)[name] = value.trim();
	}
	return out;
}

function props(node: ComarkElement): Record<string, unknown> {
	let out: Record<string, unknown> = {};
	for (let [key, value] of Object.entries(node[1])) {
		if (key === "$") continue;
		if (key === "class") out.className = value;
		else if (key === "style") out.style = style(value);
		else if (key === "tabindex") out.tabIndex = Number(value);
		else out[key] = value;
	}
	return out;
}

function cls(value: unknown, extra?: string) {
	let base = Array.isArray(value) ? value.join(" ") : typeof value === "string" ? value : "";
	return [base, extra].filter(Boolean).join(" ") || undefined;
}

function line(node: ComarkNode): node is ComarkElement {
	return elem(node) && node[0] === "span"
		&& cls(node[1].class)?.split(/\s+/).includes("line") === true;
}

function ast(node: ComarkNode, key: string, extra?: string): ReactNode {
	if (typeof node === "string") return node;
	if (!elem(node)) return null;
	let tag = node[0];
	if (tag === "br") return "\n";
	if (tag !== "span" && tag !== "code") {
		return (
			<Fragment key={key}>
				{node.slice(2).map((child, i) => ast(child as ComarkNode, `${key}.${i}`))}
			</Fragment>
		);
	}
	let p = props(node);
	if (extra) p.className = cls(p.className, extra);
	return createElement(
		tag,
		{ ...p, key },
		...(node.slice(2) as ComarkNode[]).map((child, i) => ast(child, `${key}.${i}`)),
	);
}

function rows(source: string) {
	let offset = 0;
	return source.split("\n").map(line => {
		let key = String(offset);
		offset += line.length + 1;
		return { key, line, offset: Number(key) };
	});
}

function CodeNodes({ nodes, source, streaming }: {
	nodes: ComarkNode[];
	source: string;
	streaming: boolean;
}) {
	let list = useMemo(() => rows(source), [source]);
	let edge = useRef(source.length);
	let index = 0;

	useEffect(() => {
		edge.current = source.length;
	}, [source]);

	return (
		<>
			{nodes.map((node, i) => {
				if (!line(node)) return ast(node, String(i));
				let row = list[index++];
				let fresh = streaming && row ? row.offset >= edge.current : false;
				return ast(
					node,
					row?.key || String(i),
					fresh ? "stream-token stream-token-new" : "stream-token",
				);
			})}
		</>
	);
}

function CodeStream({ source }: { source: string }) {
	let list = useMemo(() => rows(source), [source]);
	let edge = useRef(list.length);

	useEffect(() => {
		edge.current = list.length;
	}, [list.length]);

	return (
		<>
			{list.map(({ key, line }, i) => (
				<Fragment key={key}>
					<span className={i >= edge.current ? "stream-token stream-token-new" : "stream-token"}>
						{line}
					</span>
					{i < list.length - 1 && "\n"}
				</Fragment>
			))}
		</>
	);
}

export { CodeView };
