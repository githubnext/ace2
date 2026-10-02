import { useEffect, useRef, useState } from "react";

/**
 * Manage a microphone AudioContext and AnalyserNode.
 * Returns the AnalyserNode when active, null otherwise.
 *
 * @example
 * let analyser = useMic(recording);
 * // Pass to <Waveform analyser={analyser} /> or useMicLevel(analyser)
 */
function useMic(active: boolean): AnalyserNode | null {
	let [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
	let ctx = useRef<AudioContext | null>(null);
	let source = useRef<MediaStreamAudioSourceNode | null>(null);
	let stream = useRef<MediaStream | null>(null);

	useEffect(() => {
		if (!active) return;

		let cancelled = false;

		async function start() {
			let media = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (cancelled) {
				media.getTracks().forEach(t => t.stop());
				return;
			}

			let audio = new AudioContext();
			let node = audio.createAnalyser();
			node.fftSize = 64;
			node.smoothingTimeConstant = 0.6;

			let src = audio.createMediaStreamSource(media);
			src.connect(node);

			ctx.current = audio;
			source.current = src;
			stream.current = media;

			setAnalyser(node);
		}

		start();

		return () => {
			cancelled = true;
			source.current?.disconnect();
			stream.current?.getTracks().forEach(t => t.stop());
			ctx.current?.close();
			ctx.current = null;
			source.current = null;
			stream.current = null;
			setAnalyser(null);
		};
	}, [active]);

	return analyser;
}

/**
 * Derive a 0–1 amplitude scalar from an AnalyserNode each frame.
 * Uses frequency data for built-in smoothing via the analyser's smoothingTimeConstant.
 *
 * @param gain - Sensitivity multiplier (default 3).
 *
 * @example
 * let level = useMicLevel(analyser);
 * // Use to drive glow opacity, scale, etc.
 */
function useMicLevel(analyser: AnalyserNode | null, gain = 3): number {
	let [level, setLevel] = useState(0);
	let raf = useRef(0);

	useEffect(() => {
		if (!analyser) {
			setLevel(0);
			return;
		}

		let data = new Uint8Array(analyser.frequencyBinCount);

		function tick() {
			analyser!.getByteFrequencyData(data);
			let sum = 0;
			for (let i = 0; i < data.length; i++) sum += data[i];
			setLevel(Math.min(1, sum / data.length / 255 * gain));
			raf.current = requestAnimationFrame(tick);
		}

		raf.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf.current);
	}, [analyser, gain]);

	return level;
}

export { useMic, useMicLevel };
