import { cell, DEFAULT_H, DEFAULT_W, GRID_GAP, type Item, type Picture } from "./image-layout";

function ImageView(
	{ src, w, h, alt, width, fit: objectFit = "cover" }: {
		src: string;
		w: number;
		h: number;
		alt: string;
		width: number;
		fit?: "cover" | "contain";
	},
) {
	let scale = Math.min(1, width / w);
	let fit = Math.round(w * scale);
	let height = Math.round(h * scale);

	if (!src) {
		return (
			<div
				className="rounded-lg squircle flex items-end p-3 contain-strict shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
				style={{
					inlineSize: fit,
					maxInlineSize: "100%",
					blockSize: height,
					background: "linear-gradient(135deg, var(--color-muted) 0%, var(--color-border) 100%)",
				}}
			>
				<span className="text-xs text-muted-foreground">{alt} ({w}×{h})</span>
			</div>
		);
	}

	return (
		<img
			src={src}
			alt={alt}
			className="rounded-lg squircle contain-strict shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
			style={{ inlineSize: fit, maxInlineSize: "100%", blockSize: height, objectFit }}
		/>
	);
}

function ImageGrid(
	{ count, height, items, scale, width }: {
		count: number;
		height: number;
		items: Item[];
		scale: number;
		width: number;
	},
) {
	let size = cell(width, scale);

	return (
		<div
			className="grid overflow-hidden contain-content"
			style={{
				blockSize: height,
				gap: GRID_GAP,
				gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
			}}
		>
			{items.map((item) => (
				<GridImage
					key={item.key}
					image={item.image}
					height={size}
					index={item.index}
					span={count === 3 && item.index === 2}
				/>
			))}
		</div>
	);
}

function GridImage(
	{ image, height, index, span }: {
		image: Picture;
		height: number;
		index: number;
		span?: boolean;
	},
) {
	let w = image.width || DEFAULT_W;
	let h = image.height || DEFAULT_H;
	let alt = image.alt || "";

	if (!image.src) {
		return (
			<div
				className="rounded-lg squircle flex items-end p-3 bg-muted shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
				data-index={index}
				style={{
					blockSize: height,
					gridColumn: span ? "span 2" : undefined,
				}}
			>
				<span className="text-xs text-muted-foreground">{alt} ({w}×{h})</span>
			</div>
		);
	}

	return (
		<img
			src={image.src}
			alt={alt}
			data-index={index}
			className="rounded-lg squircle size-full object-cover shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
			style={{
				blockSize: height,
				gridColumn: span ? "span 2" : undefined,
			}}
		/>
	);
}

export { ImageGrid, ImageView };
