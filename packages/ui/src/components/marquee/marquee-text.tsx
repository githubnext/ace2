import { type CSSProperties, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";

const HOVER_DELAY = 2_000;

type Props = {
	/** Text to render. Truncates with ellipsis when it overflows its container. */
	text: string;
	/** Optional className applied to the inner truncating span. */
	className?: string;
};

type Measurement = {
	overflow: boolean;
	width: number;
	shift: number;
	duration: number;
};

const IDLE: Measurement = {
	overflow: false,
	width: 0,
	shift: 0,
	duration: 0,
};

/**
 * Truncates inline text and, on parent `group/marquee` hover, scrolls the
 * full text into view. The parent element must include the `group/marquee`
 * class for the hover trigger to fire.
 *
 * Animation logic — measures overflow and sets CSS vars consumed by
 * `.marquee-text[data-overflow="true"]` rules in `shadcn.css`.
 */
export function MarqueeText({ text, className }: Props) {
	let root = useRef<HTMLSpanElement>(null);
	let inner = useRef<HTMLSpanElement>(null);
	let timer = useRef<number | undefined>(undefined);
	let [active, setActive] = useState(false);
	let [state, setState] = useState<Measurement>(IDLE);

	function start(delay: number) {
		window.clearTimeout(timer.current);
		if (!state.overflow) return;
		timer.current = window.setTimeout(() => setActive(true), delay);
	}

	function stop() {
		window.clearTimeout(timer.current);
		setActive(false);
	}

	useEffect(() => {
		function update() {
			let outer = root.current;
			let text = inner.current;
			if (!outer || !text) return;

			let extra = text.scrollWidth - outer.clientWidth;
			let next = extra > 1;
			setState((previous) => {
				let measurement = next
					? {
						overflow: true,
						width: text.scrollWidth,
						shift: -extra,
						duration: extra / 64,
					}
					: IDLE;
				if (
					previous.overflow === measurement.overflow
					&& previous.width === measurement.width
					&& previous.shift === measurement.shift
					&& previous.duration === measurement.duration
				) return previous;
				return measurement;
			});
		}

		update();
		let observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
		if (root.current) observer?.observe(root.current);
		return () => {
			observer?.disconnect();
			window.clearTimeout(timer.current);
		};
	}, [text]);

	let isActive = active && state.overflow;
	let style = state.overflow
		? {
			"--marquee-width": `${state.width}px`,
			"--marquee-shift": `${state.shift}px`,
			"--marquee-duration": `${state.duration}s`,
		} as CSSProperties
		: undefined;

	return (
		<span
			ref={root}
			data-overflow={state.overflow ? "true" : undefined}
			data-active={isActive ? "true" : undefined}
			className="marquee-text-clip min-w-0 flex-1 overflow-hidden whitespace-nowrap"
			onPointerEnter={() => start(HOVER_DELAY)}
			onPointerLeave={stop}
		>
			<span
				ref={inner}
				data-overflow={state.overflow ? "true" : undefined}
				style={style}
				title={state.overflow ? text : undefined}
				className={cn("marquee-text inline-block max-w-full truncate align-bottom", className)}
			>
				{text}
			</span>
		</span>
	);
}
