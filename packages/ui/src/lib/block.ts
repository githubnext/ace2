import type { ReactNode } from "react";

/** Pixel measurement of a block at a given container width. */
type Measurement = {
	/** Exact rendered height in pixels. */
	height: number;
	/** Narrowest width that preserves the line count — lets bubbles shrink-wrap to content. */
	fit: number;
};

/**
 * Content block contract for the virtualized timeline.
 *
 * The scroll container builds a frame of absolute positions *before* any
 * item mounts, so each block must report its exact pixel size up front
 * from content + width alone. Measuring post-render (refs, layout effects)
 * would force synchronous layout per item on every mount and defeat the
 * whole point of virtualization — scroll math would drift, items would
 * overlap or leave gaps, and scroll anchoring would break.
 *
 * `measure` returns both height and fit-width in a single pass so the
 * frame build and render path share the same Pretext work.
 *
 * Text uses pretext, code is lines × line-height, images scale to width,
 * tools are fixed-height. No DOM reads anywhere.
 */
type Block = {
	/** Optional stable React key for blocks that need preserved component state across rebuilds. */
	key?: string;
	/** Exact pixel measurement at the given content width. Pure math — must not read the DOM. */
	measure(width: number): Measurement;
	/** React content for this block at the given width. */
	render(width: number): ReactNode;
};

export type { Block, Measurement };
