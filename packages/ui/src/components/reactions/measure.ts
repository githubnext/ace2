import type { Event } from "../../types";

/** Pill block-size — matches `h-5.5` in the rendered chip. */
const PILL_HEIGHT = 22;
const OVERLAP = 8;

/**
 * Pixel height of the reactions row.
 *
 * The chips are stacked into a single horizontal row (no wrap) so the height is
 * either zero or one pill tall — the timeline calls this when building its frame.
 */
function measureReactions(reactions: Event.Message.Reaction[], _width: number): number {
	return reactions.length ? PILL_HEIGHT - OVERLAP : 0;
}

export { measureReactions };
