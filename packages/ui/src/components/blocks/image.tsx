import type { Block } from "../../lib/block";

import { DEFAULT_H, DEFAULT_W, height, keys, type Picture, ratio } from "./image-layout";
import { ImageGrid, ImageView } from "./image-view";

/** Image block with known dimensions. Scales to fit width while preserving aspect ratio. */
function image(
	src: string,
	w: number,
	h: number,
	alt = "",
	fit: "cover" | "contain" = "cover",
): Block {
	if (!w || !h) {
		w = DEFAULT_W;
		h = DEFAULT_H;
	}
	return {
		measure(width) {
			let scale = Math.min(1, width / w);
			return { height: Math.round(h * scale), fit: Math.round(w * scale) };
		},
		render(width) {
			return <ImageView src={src} w={w} h={h} alt={alt} width={width} fit={fit} />;
		},
	};
}

function grid(images: Picture[]): Block {
	let scale = images.length ? ratio(images) : 0;
	let items = keys(images);

	return {
		measure(width) {
			return { height: height(images.length, width, scale), fit: width };
		},
		render(width) {
			return (
				<ImageGrid
					count={images.length}
					height={height(images.length, width, scale)}
					items={items}
					scale={scale}
					width={width}
				/>
			);
		},
	};
}

export { grid, image };
