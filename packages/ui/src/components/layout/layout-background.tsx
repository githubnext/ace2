import { Dither } from "../dither";
import { LayoutCanvas } from "./layout-canvas";
import { useResolvedTheme } from "../theme";
import { glow } from "../../lib/glow";

type Props = {
	/** Use static CSS dither instead of WebGPU canvas. */
	fallback?: boolean;
	/** Enable the rounded-rect glow around `.layout:main` to signal a loading state. */
	loading?: boolean;
	/** Multiplier for glow opacity. */
	glowOpacity?: number;
	/** Glow fade-in duration in seconds (0 = canvas default). */
	glowFadeIn?: number;
	/** Glow fade-out duration in seconds (0 = canvas default). */
	glowFadeOut?: number;
};

/** Renders the layout background — either a WebGPU canvas or static CSS dither fallback. */
function LayoutBackground({ fallback, loading, glowOpacity, glowFadeIn, glowFadeOut }: Props) {
	let scheme = useResolvedTheme();
	let color = "#7a9e85";
	let tint = "#7a9e8525";
	let alpha = 0.1;
	let noise = 0.22;

	if (fallback) {
		return (
			<>
				<Dither
					className="absolute inset-x-0 top-0 h-37 contain-strict"
					color={tint}
					scale={2}
					noise={noise}
				/>
				<Dither
					className="absolute inset-x-0 bottom-0 h-37 rotate-180 contain-strict"
					color={tint}
					scale={2}
					noise={noise}
				/>
			</>
		);
	}

	return (
		<LayoutCanvas
			alpha={alpha}
			className="absolute inset-0 rounded-[inherit] squircle contain-layout"
			color={color}
			edge={148}
			noise={noise}
			scale={2}
			glow={loading}
			glowColors={glow[scheme].colors}
			glowOpacity={glowOpacity}
			glowScale={4}
			glowNoiseFreq={0.005}
			glowNoisePower={1.4}
			glowNoiseMinAlpha={0.28}
			glowNoiseIdle={0.55}
			glowFadeIn={glowFadeIn}
			glowFadeOut={glowFadeOut}
		/>
	);
}

export { LayoutBackground };
