const DEFAULT_W = 400;
const DEFAULT_H = 300;
const GRID_GAP = 4;

type Picture = {
	src: string;
	width: number;
	height: number;
	alt?: string;
};

type Item = {
	key: string;
	image: Picture;
	index: number;
};

function height(count: number, width: number, scale: number) {
	if (!count) return 0;
	let rows = Math.ceil(count / 2);
	return rows * cell(width, scale) + (rows - 1) * GRID_GAP;
}

function cell(width: number, scale: number) {
	return Math.max(0, Math.round(((width - GRID_GAP) / 2) * scale));
}

function ratio(images: Picture[]) {
	let sum = 0;
	for (let img of images) {
		let w = img.width || DEFAULT_W;
		let h = img.height || DEFAULT_H;
		sum += h / w;
	}
	return sum / images.length;
}

function keys(images: Picture[]) {
	let seen = new Map<string, number>();
	let items: Item[] = [];
	for (let i = 0; i < images.length; i++) {
		let image = images[i]!;
		let base = `${image.src}\0${image.width}\0${image.height}\0${image.alt || ""}`;
		let count = seen.get(base) || 0;
		seen.set(base, count + 1);
		items.push({ key: count ? `${base}\0${count}` : base, image, index: i });
	}
	return items;
}

export { cell, DEFAULT_H, DEFAULT_W, GRID_GAP, height, type Item, keys, type Picture, ratio };
