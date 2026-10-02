import { type ComponentPropsWithRef, useEffect, useRef } from "react";

import { sample } from "../lib/dither";
import { cn } from "../lib/utils";

interface DitherProps extends Omit<ComponentPropsWithRef<"canvas">, "children"> {
	/** Pixel size of each dither cell */
	scale?: number;
	/** Amount of noise to add to the threshold (0–1) */
	noise?: number;
	/** Fill color override. Falls back to CSS `color` property. */
	color?: string;
}

/**
 * Bayer 4x4 ordered dither overlay rendered to a canvas.
 * Draws a monotone gradient using the classic Bayer threshold matrix.
 * Color is controlled via `bg-*` Tailwind classes — the canvas acts as a mask
 * using `mix-blend-mode` to multiply the background through the pattern.
 */
function Dither({ scale = 4, noise = 0, color, className, ref, ...props }: DitherProps) {
	let el = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (!el.current) return;

		let canvas = el.current;
		let ctx = canvas.getContext("2d")!;
		let raf = 0;

		function draw(w: number, h: number) {
			let dpr = devicePixelRatio;
			let pw = Math.round(w * dpr);
			let ph = Math.round(h * dpr);

			canvas.width = pw;
			canvas.height = ph;

			let path = new Path2D();
			let s = Math.round(scale * dpr);
			let cols = Math.ceil(pw / s);
			let rows = Math.ceil(ph / s);

			for (let y = 0, cy = 0; cy < rows; y += s, cy++) {
				for (let x = 0, cx = 0; cx < cols; x += s, cx++) {
					if (sample(cx, cy, cols, rows, noise)) {
						path.rect(x, y, s, s);
					}
				}
			}

			ctx.fillStyle = color || getComputedStyle(canvas).color;
			ctx.fill(path);
		}

		let ro = new ResizeObserver((entries) => {
			cancelAnimationFrame(raf);
			let { inlineSize: w, blockSize: h } = entries[0].contentBoxSize[0];
			raf = requestAnimationFrame(() => draw(w, h));
		});

		ro.observe(canvas);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [scale, noise, color]);

	return (
		<canvas
			ref={(node) => {
				el.current = node;
				if (typeof ref === "function") ref(node);
				else if (ref) ref.current = node;
			}}
			className={cn("block size-full contain-strict", className)}
			{...props}
		/>
	);
}

export { Dither };
