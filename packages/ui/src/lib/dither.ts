export type Direction = "top" | "bottom" | "left" | "right" | "radial";

// prettier-ignore
const BAYER = [
	0,
	8,
	2,
	10,
	12,
	4,
	14,
	6,
	3,
	11,
	1,
	9,
	15,
	7,
	13,
	5,
];

function hash(x: number, y: number) {
	let h = x * 374761393 + y * 668265263;
	h = (h ^ (h >> 13)) * 1274126177;
	return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function gradient(cx: number, cy: number, cols: number, rows: number, direction: Direction) {
	switch (direction) {
		case "top":
			return cy / rows;
		case "bottom":
			return 1 - cy / rows;
		case "left":
			return cx / cols;
		case "right":
			return 1 - cx / cols;
		case "radial": {
			let dx = (cx / cols - 0.5) * 2;
			let dy = (cy / rows - 0.5) * 2;
			return Math.min(1, Math.sqrt(dx * dx + dy * dy));
		}
	}
}

export function sample(
	cx: number,
	cy: number,
	cols: number,
	rows: number,
	noise = 0,
	direction: Direction = "top",
	invert = false,
) {
	let norm = gradient(cx, cy, cols, rows, direction);
	let jitter = noise > 0 ? noise * (hash(cx, cy) - 0.5) : 0;
	let row = (cy % 4) * 4;
	let threshold = (BAYER[row + (cx % 4)] + 0.5) / 16 + jitter;
	return invert ? norm >= threshold : norm < threshold;
}
