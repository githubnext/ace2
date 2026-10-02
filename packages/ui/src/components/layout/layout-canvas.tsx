import { type ComponentPropsWithRef, useEffect, useEffectEvent, useRef } from "react";

import { cn } from "../../lib/utils";
import { render } from "./canvas-renderer";

type CanvasProps = Omit<ComponentPropsWithRef<"canvas">, "children"> & {
	/** Pixel size of each dither cell before DPR scaling. */
	scale?: number;
	/** Amount of noise added to each Bayer threshold. */
	noise?: number;
	/** Height of each visible dither band in CSS pixels. */
	edge?: number;
	/** Base output alpha applied in the shader. */
	alpha?: number;
	/** Dot color as hex string (e.g. "#7a9e85"). */
	color?: string;
	/** Enable a rounded-rect glow that tracks the `.layout:main` element. */
	glow?: boolean;
	/** Hex color palette for speckles (max 8). */
	glowColors?: string[];
	/** Multiplier applied to final glow alpha. */
	glowOpacity?: number;
	/** Visual scale of the glow — affects core width and halo radius. */
	glowScale?: number;
	/** Spatial frequency of the fractal noise mask. */
	glowNoiseFreq?: number;
	/** Exponent applied to the noise mask (higher = more contrast). */
	glowNoisePower?: number;
	/** Minimum noise alpha — prevents full occlusion. */
	glowNoiseMinAlpha?: number;
	/** Idle value mixed with noise when no activity. */
	glowNoiseIdle?: number;
	/** Scale of noise applied to final alpha. */
	glowNoiseStrength?: number;
	/** Time multiplier for noise animation. */
	glowNoiseAnim?: number;
	/** Activity level drives noise animation speed. */
	glowNoiseActivity?: number;
	/** Fade-in duration in seconds (0 = use default). */
	glowFadeIn?: number;
	/** Fade-out duration in seconds (0 = use default). */
	glowFadeOut?: number;
};

const APPLE = [
	"#efb04c",
	"#e98056",
	"#ea4b6b",
	"#e661a5",
	"#df8ae9",
	"#c0a0f5",
	"#64b5f5",
	"#7ec9ee",
];
/**
 * Full-shell WebGPU renderer for dither bands with GPU-based mouse trail and
 * an optional rounded-rect glow that tracks the `.layout:main` element.
 */
export function LayoutCanvas({
	scale = 2,
	noise = 0.3,
	edge = 148,
	alpha = 0.05,
	color = "#7a9e85",
	glow: glowOn = false,
	glowColors = APPLE,
	glowOpacity = 1,
	glowScale = 32,
	glowNoiseFreq = 0.004,
	glowNoisePower = 1.2,
	glowNoiseMinAlpha = 0.35,
	glowNoiseIdle = 0.6,
	glowNoiseStrength = 0.9,
	glowNoiseAnim = 0.25,
	glowNoiseActivity = 1.0,
	glowFadeIn = 0,
	glowFadeOut = 0,
	className,
	ref,
	...props
}: CanvasProps) {
	let el = useRef<HTMLCanvasElement>(null);
	let kick = useRef<() => void>(() => {});
	let value = {
		glowOn,
		glowColors,
		glowOpacity,
		glowScale,
		glowNoiseFreq,
		glowNoisePower,
		glowNoiseMinAlpha,
		glowNoiseIdle,
		glowNoiseStrength,
		glowNoiseAnim,
		glowNoiseActivity,
		glowFadeIn,
		glowFadeOut,
	};
	let params = useEffectEvent(() => value);

	useEffect(() => {
		if (!el.current || !navigator.gpu) return;
		let renderer = render(el.current, { scale, noise, edge, alpha, color }, () => params());
		kick.current = renderer.kick;
		return () => {
			kick.current = () => {};
			renderer.dispose();
		};
	}, [alpha, edge, noise, scale, color]);

	useEffect(() => {
		if (glowOn) kick.current();
	}, [glowOn]);

	return (
		<canvas
			ref={(node) => {
				el.current = node;
				if (typeof ref === "function") ref(node);
				else if (ref) ref.current = node;
			}}
			aria-hidden="true"
			className={cn("pointer-events-none block size-full", className)}
			{...props}
		/>
	);
}
