import { measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";

const ELLIPSIS = "…";

function width(text: string, font: string): number {
	if (!text) return 0;
	return measureNaturalWidth(prepareWithSegments(text, font));
}

function middle(text: string, available: number, font: string): string {
	if (!text || width(text, font) <= available) return text;
	if (available <= width(ELLIPSIS, font)) return ELLIPSIS;

	for (let keep = text.length - 1; keep >= 1; keep--) {
		let head = Math.ceil(keep / 2);
		let tail = keep - head;
		let next = text.slice(0, head) + ELLIPSIS + text.slice(text.length - tail);
		if (width(next, font) <= available) return next;
	}

	return ELLIPSIS;
}

export { middle, width };
