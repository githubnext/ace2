import { type ComponentPropsWithRef, useEffect, useRef } from "react";

import { cn } from "../../lib/utils";

type Props = ComponentPropsWithRef<"div"> & {
	/** Whether the loader is actively animating. When toggled off, the trail crossfades into the full shape. Defaults to `false`. */
	loading?: boolean;
};

type Curve = { R: number; scale: number };

const FOUR: Curve = { R: 4, scale: 5.2 };
const FIVE: Curve = { R: 5, scale: 4.6 };
const SMALL_THRESHOLD = 40;
const PATH_STEPS = 360;

const DURATION_MS = 4000;
const PULSE_DURATION_MS = 4200;
const ROTATION_DURATION_MS = 28000;
const STOP_DURATION_MS = 300;

const PARTICLE_COUNT = 84;
const TRAIL_SPAN = 0.34;
const STROKE_WIDTH = 5.8;
const BG_OPACITY = 0.1;
const TAU = Math.PI * 2;

const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
	let tail = i / (PARTICLE_COUNT - 1);
	let f = (1 - tail) ** 0.58;
	return { tail, radius: 1.5 + f * 3.6, opacity: 0.08 + f * 0.92 };
});

function point(curve: Curve, progress: number, detail: number) {
	let t = (((progress % 1) + 1) % 1) * TAU;
	let k = curve.R - 1;
	let d = 3 + detail * 0.25;
	let s = curve.scale + detail * 0.45;
	return {
		x: 50 + (k * Math.cos(t) + d * Math.cos(k * t)) * s,
		y: 50 + (k * Math.sin(t) - d * Math.sin(k * t)) * s,
	};
}

function pulse(time: number) {
	let progress = (time % PULSE_DURATION_MS) / PULSE_DURATION_MS;
	return 0.5 + ((Math.sin(progress * TAU + 0.55) + 1) / 2) * 0.45;
}

function AceAvatar({ loading = false, className, ref, ...props }: Props) {
	let container = useRef<HTMLDivElement>(null);
	let canvas = useRef<HTMLCanvasElement>(null);
	let loadingRef = useRef(loading);
	let resume = useRef<() => void>(() => {});

	useEffect(() => {
		loadingRef.current = loading;
		if (loading) resume.current();
	}, [loading]);

	useEffect(() => {
		let node = container.current;
		let cvs = canvas.current;
		if (!node || !cvs) return;
		let ctx = cvs.getContext("2d");
		if (!ctx) return;

		let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let curve: Curve = FIVE;
		let w = 0;
		let h = 0;
		let dpr = 1;
		let visible = true;
		let raf = 0;
		let last = 0;
		let clock = 0;
		let spin = 0;
		let stopT = loadingRef.current ? 0 : 1;

		function render() {
			if (!w || !h) return;
			let progress = (clock % DURATION_MS) / DURATION_MS;
			let detail = pulse(clock);
			let scale = (dpr * w) / 100;

			ctx!.setTransform(scale, 0, 0, scale, 0, 0);
			ctx!.clearRect(0, 0, 100, 100);
			ctx!.translate(50, 50);
			ctx!.rotate((spin * Math.PI) / 180);
			ctx!.translate(-50, -50);

			let col = getComputedStyle(node!).color;
			ctx!.strokeStyle = col;
			ctx!.fillStyle = col;
			ctx!.lineCap = "round";
			ctx!.lineJoin = "round";
			ctx!.lineWidth = STROKE_WIDTH;

			ctx!.globalAlpha = BG_OPACITY + (1 - BG_OPACITY) * stopT;
			ctx!.beginPath();
			for (let i = 0; i < PATH_STEPS; i++) {
				let p = point(curve, i / PATH_STEPS, detail);
				if (i === 0) ctx!.moveTo(p.x, p.y);
				else ctx!.lineTo(p.x, p.y);
			}
			ctx!.closePath();
			ctx!.stroke();

			if (stopT >= 1) return;
			let target = STROKE_WIDTH / 2;
			let trail = 1 - stopT;
			for (let i = 0; i < PARTICLE_COUNT; i++) {
				let { tail, radius, opacity } = PARTICLES[i];
				let p = point(curve, progress - tail * TRAIL_SPAN, detail);
				let r = radius + (target - radius) * stopT;
				ctx!.globalAlpha = opacity * trail;
				ctx!.beginPath();
				ctx!.arc(p.x, p.y, r, 0, TAU);
				ctx!.fill();
			}
		}

		function frame(now: number) {
			let dt = now - last;
			last = now;
			if (loadingRef.current) stopT = Math.max(0, stopT - dt / STOP_DURATION_MS);
			else stopT = Math.min(1, stopT + dt / STOP_DURATION_MS);
			clock += dt;
			spin -= (dt * 360) / ROTATION_DURATION_MS;
			if (visible) render();
			if (!loadingRef.current && stopT >= 1) {
				raf = 0;
				return;
			}
			raf = requestAnimationFrame(frame);
		}

		resume.current = () => {
			if (raf || reduced || !visible) return;
			if (!loadingRef.current && stopT >= 1) return;
			last = performance.now();
			raf = requestAnimationFrame(frame);
		};

		let ro = new ResizeObserver(([entry]) => {
			w = entry.contentRect.width;
			h = entry.contentRect.height;
			dpr = window.devicePixelRatio || 1;
			cvs.width = Math.round(w * dpr);
			cvs.height = Math.round(h * dpr);
			curve = w < SMALL_THRESHOLD ? FOUR : FIVE;
			if (visible) render();
			resume.current();
		});
		ro.observe(node);

		let io = new IntersectionObserver(([entry]) => {
			let was = visible;
			visible = entry.isIntersecting;
			if (!visible && raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			} else if (visible && !was) {
				if (!loadingRef.current && stopT >= 1) render();
				else resume.current();
			}
		});
		io.observe(node);

		if (!reduced) resume.current();

		return () => {
			ro.disconnect();
			io.disconnect();
			if (raf) cancelAnimationFrame(raf);
		};
	}, []);

	return (
		<div
			ref={(el) => {
				container.current = el;
				if (typeof ref === "function") ref(el);
				else if (ref) ref.current = el;
			}}
			data-slot="ace-avatar"
			className={cn(
				"size-full contain-strict bg-primary text-primary-foreground",
				className,
			)}
			{...props}
		>
			<canvas ref={canvas} className="size-full" aria-hidden="true" />
		</div>
	);
}

export { AceAvatar };
export type { Props as AceAvatarProps };
