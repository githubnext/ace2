import { isUrl } from "./utils";

type GithubComment = {
	body: string;
};

const TOKEN = "\uE000github-comment-code";

function decode(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/gi, "'")
		.replace(/&amp;/g, "&");
}

function space(value: string): boolean {
	return value === " " || value === "\n" || value === "\r" || value === "\t";
}

function attr(source: string, name: string): string | undefined {
	let goal = name.toLowerCase();
	let cursor = 0;

	while (cursor < source.length) {
		while (space(source[cursor] || "")) cursor++;

		let start = cursor;
		while (cursor < source.length) {
			let char = source[cursor]!;
			if (space(char) || char === "=" || char === "/" || char === ">") break;
			cursor++;
		}

		let key = source.slice(start, cursor).toLowerCase();
		while (space(source[cursor] || "")) cursor++;
		if (source[cursor] !== "=") {
			cursor++;
			continue;
		}

		cursor++;
		while (space(source[cursor] || "")) cursor++;

		let quote = source[cursor];
		let value = "";
		if (quote === '"' || quote === "'") {
			cursor++;
			let end = source.indexOf(quote, cursor);
			if (end === -1) return undefined;
			value = source.slice(cursor, end);
			cursor = end + 1;
		} else {
			let end = cursor;
			while (end < source.length && !space(source[end]!) && source[end] !== ">") end++;
			value = source.slice(cursor, end);
			cursor = end;
		}

		if (key === goal) return decode(value);
	}
}

function text(source: string): string {
	let out = "";
	let cursor = 0;
	while (cursor < source.length) {
		if (source[cursor] === "<") {
			let end = tag(source, cursor);
			if (end !== null) {
				cursor = end + 1;
				continue;
			}
			out += "&lt;";
			cursor++;
			continue;
		}

		out += source[cursor++];
	}

	return decode(out)
		.replace(/\s+/g, " ")
		.trim();
}

function escapeLabel(value: string): string {
	return value.replace(/([\\[\]])/g, "\\$1");
}

function escapeDestination(value: string): string {
	return value
		.replace(/\\/g, "%5C")
		.replace(/</g, "%3C")
		.replace(/>/g, "%3E");
}

function safeLink(attrs: string, inner: string): string {
	let img = image(inner);
	let label = img ? imageLabel(inner, img) : text(inner);
	let href = attr(attrs, "href");
	if (!href || !isUrl(href)) return label;
	return label ? `[${escapeLabel(label)}](<${escapeDestination(href)}>)` : href;
}

function imageLabel(inner: string, img: ImageData): string {
	return img.alt || text(inner) || "Open image";
}

function markdownImage(img: ImageData): string {
	return `![${escapeLabel(img.alt)}](<${escapeDestination(img.src)}>)`;
}

function tag(source: string, start: number): number | null {
	let quote: string | null = null;
	for (let i = start + 1; i < source.length; i++) {
		let char = source[i]!;
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === ">") return i;
	}
	return null;
}

function named(source: string, start: number, name: string): boolean {
	let tag = source.slice(start + 1, start + 1 + name.length).toLowerCase();
	if (tag !== name) return false;
	let next = source[start + 1 + name.length];
	return !next || space(next) || next === ">" || next === "/";
}

function closing(source: string, start: number, name: string): boolean {
	if (source[start] !== "<" || source[start + 1] !== "/") return false;
	let tag = source.slice(start + 2, start + 2 + name.length).toLowerCase();
	if (tag !== name) return false;
	let next = source[start + 2 + name.length];
	return !next || space(next) || next === ">" || next === "/";
}

function findClosing(source: string, name: string, start: number): number | null {
	let lower = source.toLowerCase();
	let needle = `</${name}`;
	let cursor = start;

	while (cursor < source.length) {
		let index = lower.indexOf(needle, cursor);
		if (index === -1) return null;
		if (closing(source, index, name)) return index;
		cursor = index + needle.length;
	}

	return null;
}

type ImageData = {
	src: string;
	alt: string;
};

function image(source: string): ImageData | undefined {
	let lower = source.toLowerCase();
	let cursor = 0;

	while (cursor < source.length) {
		let start = lower.indexOf("<img", cursor);
		if (start === -1) return undefined;
		if (!named(source, start, "img")) {
			cursor = start + 4;
			continue;
		}

		let open = tag(source, start);
		if (open === null) return undefined;
		let attrs = source.slice(start + 4, open);
		let src = attr(attrs, "src");
		let alt = attr(attrs, "alt") || "";
		if (src && isUrl(src)) return { src, alt };
		if (alt) return { src: "", alt };
		cursor = open + 1;
	}
}

function protect(raw: string): { body: string; restore(body: string): string } {
	let slots: string[] = [];
	let body = "";
	let cursor = 0;

	function token(value: string): string {
		let index = slots.push(value) - 1;
		return `${TOKEN}-${index}\uE000`;
	}

	while (cursor < raw.length) {
		let fenced = fence(raw, cursor);
		if (fenced) {
			body += token(raw.slice(cursor, fenced));
			cursor = fenced;
			continue;
		}

		let inline = span(raw, cursor);
		if (inline) {
			body += token(raw.slice(cursor, inline));
			cursor = inline;
			continue;
		}

		let indented = indent(raw, cursor);
		if (indented) {
			body += token(raw.slice(cursor, indented));
			cursor = indented;
			continue;
		}

		body += raw[cursor++];
	}

	return {
		body,
		restore(value) {
			return value.replace(new RegExp(`${TOKEN}-(\\d+)\uE000`, "g"), (_, index: string) => {
				return slots[Number(index)] || "";
			});
		},
	};
}

function fence(raw: string, start: number): number | null {
	if (start > 0 && raw[start - 1] !== "\n") return null;
	let match = /^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(raw.slice(start));
	if (!match) return null;

	let mark = match[2]!;
	let char = mark[0]!;
	let size = mark.length;
	let cursor = start + match[0]!.length;
	let close = new RegExp(`^ {0,3}\\${char}{${size},}[ \t]*(?:\n|$)`);

	while (cursor < raw.length) {
		let next = raw.indexOf("\n", cursor);
		let end = next === -1 ? raw.length : next + 1;
		let line = raw.slice(cursor, end);
		if (close.test(line)) return end;
		cursor = end;
	}

	return raw.length;
}

function indent(raw: string, start: number): number | null {
	if (start > 0 && raw[start - 1] !== "\n") return null;
	let line = raw.slice(start, start + 4);
	if (line !== "    " && raw[start] !== "\t") return null;

	let cursor = start;
	while (cursor < raw.length) {
		let next = raw.indexOf("\n", cursor);
		let end = next === -1 ? raw.length : next + 1;
		let text = raw.slice(cursor, next === -1 ? end : next);
		if (text && !text.startsWith("    ") && !text.startsWith("\t")) break;
		cursor = end;
	}

	return cursor;
}

function span(raw: string, start: number): number | null {
	if (raw[start] !== "`") return null;
	let size = 1;
	while (raw[start + size] === "`") size++;
	let mark = "`".repeat(size);
	let close = raw.indexOf(mark, start + size);
	return close === -1 ? null : close + size;
}

function anchors(raw: string): string {
	let out = "";
	let lower = raw.toLowerCase();
	let cursor = 0;

	while (cursor < raw.length) {
		let start = lower.indexOf("<a", cursor);
		if (start === -1) {
			out += raw.slice(cursor);
			break;
		}
		if (!named(raw, start, "a")) {
			out += raw.slice(cursor, start + 2);
			cursor = start + 2;
			continue;
		}

		let open = tag(raw, start);
		let close = lower.indexOf("</a>", open === null ? start : open + 1);
		if (open === null || close === -1) {
			out += raw.slice(cursor);
			break;
		}

		let attrs = raw.slice(start + 2, open);
		let inner = raw.slice(open + 1, close);
		out += raw.slice(cursor, start);
		out += safeLink(attrs, inner);
		cursor = close + 4;
	}

	return out;
}

function images(raw: string): string {
	let out = "";
	let lower = raw.toLowerCase();
	let cursor = 0;

	while (cursor < raw.length) {
		let start = lower.indexOf("<img", cursor);
		if (start === -1) {
			out += raw.slice(cursor);
			break;
		}
		if (!named(raw, start, "img")) {
			out += raw.slice(cursor, start + 4);
			cursor = start + 4;
			continue;
		}

		let open = tag(raw, start);
		if (open === null) {
			out += raw.slice(cursor);
			break;
		}

		let attrs = raw.slice(start + 4, open);
		let img = image(raw.slice(start, open + 1));
		out += raw.slice(cursor, start);
		if (img?.src) {
			out += markdownImage(img);
		} else {
			out += attr(attrs, "alt") || "";
		}
		cursor = open + 1;
	}

	return out;
}

function details(raw: string): string {
	let out = "";
	let cursor = 0;

	while (cursor < raw.length) {
		let start = raw.indexOf("<", cursor);
		if (start === -1) {
			out += raw.slice(cursor);
			break;
		}

		if (named(raw, start, "details")) {
			let open = tag(raw, start);
			if (open === null) {
				out += raw.slice(cursor);
				break;
			}

			let inner = open + 1;
			while (space(raw[inner] || "")) inner++;

			if (named(raw, inner, "summary")) {
				let summaryOpen = tag(raw, inner);
				let summaryClose = summaryOpen === null
					? null
					: findClosing(raw, "summary", summaryOpen + 1);
				let summaryEnd = summaryClose === null ? null : tag(raw, summaryClose);

				if (summaryOpen !== null && summaryClose !== null && summaryEnd !== null) {
					out += raw.slice(cursor, start);
					out += `\n\n**${text(raw.slice(summaryOpen + 1, summaryClose))}**\n\n`;
					cursor = summaryEnd + 1;
					continue;
				}

				out += raw.slice(cursor);
				break;
			}

			out += raw.slice(cursor, open + 1);
			cursor = open + 1;
			continue;
		}

		if (closing(raw, start, "details")) {
			let close = tag(raw, start);
			if (close === null) {
				out += raw.slice(cursor);
				break;
			}
			out += raw.slice(cursor, start);
			cursor = close + 1;
			continue;
		}

		out += raw.slice(cursor, start + 1);
		cursor = start + 1;
	}

	return out;
}

function normalizeGithubComment(raw: string): GithubComment {
	let safe = protect(raw);
	let body = anchors(safe.body);

	body = details(images(body))
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return { body: safe.restore(body) };
}

export { normalizeGithubComment };
