/** Single item in a scroll frame. */
export type FrameItem = {
	top: number;
	height: number;
	bottom: number;
};

/** Pre-computed layout frame for virtual scrolling. */
export type Frame = {
	items: FrameItem[];
	total: number;
};

/** Build a layout frame from item count and a height-per-index function. */
export function frame(count: number, height: (index: number) => number, gap = 0, end = 0): Frame {
	let items: FrameItem[] = Array.from({ length: count });
	let y = 0;
	for (let i = 0; i < count; i++) {
		let h = height(i);
		items[i] = { top: y, height: h, bottom: y + h };
		y += h + gap;
	}
	return { items, total: (count > 0 ? y - gap : 0) + end };
}

/**
 * Binary search for the range of items visible in the viewport.
 * Returns `{ start, end }` where `end` is exclusive.
 */
export function visible(
	frame: Frame,
	scroll: number,
	viewport: number,
	overscan = 0,
): { start: number; end: number } {
	let { items } = frame;
	if (items.length === 0) return { start: 0, end: 0 };

	let min = scroll - overscan;
	let max = scroll + viewport + overscan;

	let low = 0;
	let high = items.length;
	while (low < high) {
		let mid = (low + high) >> 1;
		if (items[mid]!.bottom > min) high = mid;
		else low = mid + 1;
	}
	let start = low;

	low = start;
	high = items.length;
	while (low < high) {
		let mid = (low + high) >> 1;
		if (items[mid]!.top >= max) high = mid;
		else low = mid + 1;
	}

	return { start, end: low };
}
