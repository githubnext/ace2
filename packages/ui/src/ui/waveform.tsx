import { type ComponentPropsWithRef, useEffect, useRef, useState } from "react";
import { m as motion } from "motion/react";
import { cn } from "../lib/utils";

type Props = ComponentPropsWithRef<"span"> & {
	/** AnalyserNode to read frequency data from. */
	analyser?: AnalyserNode | null;
	/** Number of bars to render. */
	bars?: number;
	/** Minimum bar height in pixels. */
	min?: number;
	/** Maximum bar height in pixels. */
	max?: number;
	/** Sensitivity multiplier for mic levels (default 1.8). */
	gain?: number;
};

function useLevels(analyser: AnalyserNode | null, bars: number, gain: number) {
	let [levels, setLevels] = useState<number[]>(() => Array(bars).fill(0));
	let raf = useRef(0);

	useEffect(() => {
		if (!analyser) {
			setLevels(Array(bars).fill(0));
			return;
		}

		let data = new Uint8Array(analyser.frequencyBinCount);
		let step = Math.floor(analyser.frequencyBinCount / bars);

		// Display positions ordered center-out: e.g. for 5 bars → [2,1,3,0,4]
		let positions: number[] = [];
		let mid = Math.floor(bars / 2);
		for (let d = 0; positions.length < bars; d++) {
			if (d === 0) {
				positions.push(mid);
				continue;
			}
			if (mid - d >= 0) positions.push(mid - d);
			if (mid + d < bars) positions.push(mid + d);
		}

		function tick() {
			analyser!.getByteFrequencyData(data);

			let raw: number[] = [];
			for (let i = 0; i < bars; i++) {
				let sum = 0;
				let count = 0;
				for (let j = i * step; j < (i + 1) * step && j < data.length; j++) {
					sum += data[j];
					count++;
				}
				raw.push(count ? Math.min(1, sum / count / 255 * gain) : 0);
			}

			let values = Array.from<number>({ length: bars });
			for (let i = 0; i < bars; i++) values[positions[i]] = raw[i];

			setLevels(values);
			raf.current = requestAnimationFrame(tick);
		}

		raf.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf.current);
	}, [analyser, bars, gain]);

	return levels;
}

/** Animated audio waveform bars driven by an AnalyserNode. */
function Waveform(
	{ analyser = null, bars = 5, min = 4, max = 16, gain = 1.8, className, ref, ...props }: Props,
) {
	let levels = useLevels(analyser, bars, gain);
	let mid = (bars - 1) / 2;

	return (
		<span
			ref={ref}
			className={cn("flex items-center gap-px", className)}
			style={{ height: max }}
			aria-hidden
			{...props}
		>
			{levels.map((level, i) => {
				let falloff = mid ? 1 - 0.6 * (Math.abs(i - mid) / mid) : 1;
				let visible = min + level * falloff * (max - min);
				let inset = ((max - visible) / 2 / max) * 100;
				return (
					<motion.span
						key={i}
						className="inline-block w-[2.5px] rounded-full bg-current "
						style={{ height: max }}
						initial={{ clipPath: `inset(${((max - min) / 2 / max) * 100}% 0 round 9999px)` }}
						animate={{ clipPath: `inset(${inset}% 0 round 9999px)` }}
						transition={{ duration: 0.07, ease: "easeOut" }}
					/>
				);
			})}
		</span>
	);
}

export { Waveform };
