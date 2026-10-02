import {
	type ClipboardEvent,
	type ComponentPropsWithRef,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";

import { iconFor } from "../../lib/file-icon";
import { cn } from "../../lib/utils";

import { SMALL_FONT } from "../blocks/constants";

const FONT = SMALL_FONT.replace("12px", "12px/14px");
const ELLIPSIS = "…";
const SEP = "/";

function measure(text: string): number {
	if (!text) return 0;
	return measureNaturalWidth(prepareWithSegments(text, FONT));
}

/** Char-level middle truncation of a filename, preserving the extension. */
function truncateFile(name: string, available: number): string {
	let dot = name.lastIndexOf(".");
	let ext = dot > 0 ? name.slice(dot) : "";
	let base = dot > 0 ? name.slice(0, dot) : name;
	for (let keep = base.length - 1; keep >= 1; keep--) {
		let head = Math.ceil(keep / 2);
		let tail = keep - head;
		let candidate = base.slice(0, head) + ELLIPSIS + base.slice(base.length - tail) + ext;
		if (measure(candidate) <= available) return candidate;
	}
	return ELLIPSIS + ext;
}

type Resolved = { dir: string; file: string };

/**
 * Find the longest rendering that fits into `available` pixels.
 * Segment-first: grow by whole directory chunks (including the neighboring
 * separator) from both sides of the ellipsis, biased toward the tail so the
 * filename-adjacent context is preserved first.
 */
function resolve(path: string, available: number): Resolved {
	let parts = path.split(SEP);
	let file = parts.pop() || "";
	let dirs = parts;
	let fileW = measure(file);

	if (dirs.length === 0) {
		return { dir: "", file: fileW <= available ? file : truncateFile(file, available) };
	}

	let full = dirs.join(SEP);
	if (measure(full + SEP) + fileW <= available) return { dir: full, file };

	let fits = (h: string, t: string) => measure(h + ELLIPSIS + t + SEP) + fileW <= available;

	if (!fits("", "")) return { dir: "", file: truncateFile(file, available) };

	let hidden = full;
	let headExt = "";
	let tailExt = "";
	let left = 0;
	let right = hidden.length;
	let tailStuck = false;
	let headStuck = false;

	while (left < right && (!tailStuck || !headStuck)) {
		if (!tailStuck) {
			let i = right - 1;
			while (i > left && hidden[i] !== SEP) i--;
			let chunk = hidden.slice(i, right);
			if (fits(headExt, chunk + tailExt)) {
				tailExt = chunk + tailExt;
				right = i;
			} else {
				tailStuck = true;
			}
		}
		if (left >= right) break;
		if (!headStuck) {
			let j = left;
			while (j < right && hidden[j] !== SEP) j++;
			if (j < right) j++;
			let chunk = hidden.slice(left, j);
			if (fits(headExt + chunk, tailExt)) {
				headExt = headExt + chunk;
				left = j;
			} else {
				headStuck = true;
			}
		}
	}

	return { dir: headExt + ELLIPSIS + tailExt, file };
}

type Props = ComponentPropsWithRef<"div"> & {
	/** File path to display, e.g. "src/components/blocks/tool.tsx". */
	path: string;
	/** Optional icon override. Defaults to a generic file icon. */
	icon?: ReactNode;
	/** Render the final segment in a stronger color than the directory. Defaults to `true`. */
	highlight?: boolean;
};

/** Inline file path with icon, middle-truncating the directory so the filename stays intact. */
function FilePath({ path, icon, highlight = true, className, ref, ...rest }: Props) {
	let hostRef = useRef<HTMLDivElement | null>(null);
	let [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		let el = hostRef.current;
		if (!el) return;
		setWidth(el.clientWidth);
		let ro = new ResizeObserver((entries) => {
			for (let entry of entries) setWidth(entry.contentRect.width);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	let available = Math.max(0, width - 14 - 6);
	let { dir, file } = resolve(path, available);
	let Icon = iconFor(path);

	function copy(e: ClipboardEvent<HTMLSpanElement>) {
		e.preventDefault();
		e.clipboardData.setData("text/plain", path);
	}

	return (
		<div
			ref={(node) => {
				hostRef.current = node;
				if (typeof ref === "function") ref(node);
				else if (ref) ref.current = node;
			}}
			className={cn("flex items-center gap-1.5 min-w-0 w-full", className)}
			style={{ font: FONT }}
			{...rest}
		>
			{icon ?? <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
			<span
				className="min-w-0 whitespace-nowrap overflow-hidden select-text cursor-text"
				onCopy={copy}
			>
				{dir && <span className="text-muted-foreground">{dir}/</span>}
				<span className={highlight ? "text-foreground" : "text-muted-foreground"}>{file}</span>
			</span>
		</div>
	);
}

export { FilePath };
