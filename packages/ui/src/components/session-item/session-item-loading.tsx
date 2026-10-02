import { LOADING_PHRASES, PHRASE_INTERVAL } from "./loading";
import { animate, AnimatePresence, m as motion, useMotionValue } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { IconHash, IconLoader } from "../../icons";

/* ─────────────────────────────────────────────────────────
 * SESSION-CREATION LOADING SEQUENCE
 *
 * Phrase rotation is internal; settle timing is driven by the
 * parent via the `settled` prop (set true when the backend signals
 * the session is ready).
 * ───────────────────────────────────────────────────────── */

function shuffle<T>(values: T[]) {
	let next = [...values];
	for (let i = next.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		[next[i], next[j]] = [next[j], next[i]];
	}
	return next;
}

function phrases() {
	let [first, ...rest] = LOADING_PHRASES;
	return [first, ...shuffle(rest)];
}

/** Spinner physics */
const SPIN_TRANSITION = {
	type: "spring" as const,
	stiffness: 108,
	damping: 19,
	mass: 0.8,
	repeat: Infinity,
};

/** Icon swap */
const ICON_SWAP = {
	initial: { opacity: 0, scale: 0.85, filter: "blur(4px)" },
	animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
	exit: { opacity: 0, scale: 0.85, filter: "blur(4px)" },
	transition: { duration: 0.4, ease: "easeOut" as const },
};

const SPINNER_SIZE = {
	14: "size-3.5",
	18: "size-4.5",
} as const;

/** Plain opacity crossfade between text values. */
function CrossfadeText({ shimmer, text }: { shimmer?: boolean; text: string }) {
	return (
		<span className="relative block min-w-0 flex-1 truncate">
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={text}
					className={cn("block truncate", shimmer && "text-shimmer")}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.25 }}
				>
					{text}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

/**
 * Continuously rotating loading icon. Drives `rotate` imperatively so the
 * animation is decoupled from AnimatePresence's initial-suppression logic
 * (which would otherwise skip the spin's `initial={rotate: 0}` on first mount).
 */
export function LoadingSpinner(
	{ runId = 0, size }: { runId?: number; size?: keyof typeof SPINNER_SIZE },
) {
	let rotate = useMotionValue(0);

	useEffect(() => {
		rotate.set(0);
		let controls = animate(rotate, 360, SPIN_TRANSITION);
		return () => controls.stop();
	}, [runId, rotate]);

	return (
		<motion.span
			className="grid place-items-center size-full"
			style={{ rotate }}
		>
			<IconLoader className={size ? SPINNER_SIZE[size] : undefined} />
		</motion.span>
	);
}

/**
 * Session row in its loading state. Phrase rotation runs internally
 * while `settled` is false; flip `settled` to true (driven by the
 * parent's backend signal) to swap to the resolved session name and
 * hashtag icon. `runId` resets the phrase rotation for replay;
 * production callers can omit it.
 */
export function SessionItemLoading(props: LoadingProps) {
	return <Loading key={props.runId} {...props} />;
}

type LoadingProps = {
	settled: boolean;
	runId?: number;
	sessionName?: string;
	selected?: boolean;
};

function Loading(
	{ settled, runId = 0, sessionName = "", selected = false }: LoadingProps,
) {
	let [phraseIdx, setPhraseIdx] = useState(0);
	let [sequence] = useState(phrases);

	useEffect(() => {
		if (settled) return;
		let interval = setInterval(
			() => setPhraseIdx((x) => x + 1),
			PHRASE_INTERVAL,
		);
		return () => clearInterval(interval);
	}, [settled, runId]);

	let text = settled ? sessionName : sequence[phraseIdx % sequence.length];
	let iconNode = settled ? <IconHash /> : <LoadingSpinner runId={runId} />;

	return (
		<div
			data-status={selected ? "active" : undefined}
			className={cn(
				"group/row relative z-0 flex h-[calc(var(--spacing)*8-2px)] items-center gap-1.5 px-1 text-sm -my-0.5",
				"rounded-lg squircle border border-transparent bg-clip-padding",
				"not-data-[status=active]:hover:bg-background/50",
				"not-data-[status=active]:hover:backdrop-blur-[1px]",
				"data-[status=active]:z-1 data-[status=active]:bg-popover/35 dark:data-[status=active]:bg-black/32",
				"data-[status=active]:backdrop-blur-[1px]",
				"data-[status=active]:selected-surface",
				"data-[status=active]:text-accent-text data-[status=active]:font-medium",
			)}
		>
			<span className="relative grid size-6 place-items-center shrink-0 text-muted-foreground group-data-[status=active]/row:text-current/80 [&_svg]:size-4.5 [&_svg]:shrink-0">
				<AnimatePresence initial={false}>
					<motion.span
						key={settled ? "hashtag" : "spinner"}
						className="absolute inset-0 grid place-items-center"
						{...ICON_SWAP}
					>
						{iconNode}
					</motion.span>
				</AnimatePresence>
			</span>
			<CrossfadeText text={text} shimmer={!settled} />
		</div>
	);
}
