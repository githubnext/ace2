import type { Block } from "../../lib/block";
import { Diff } from "../diff/diff";
import { parseDiff } from "../../lib/highlighter";

const LINE_HEIGHT = 20;
const SEPARATOR_HEIGHT = 32;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 2;
const BORDER_Y = 2;

/** Unified-diff block rendering a single-file patch via @pierre/diffs. */
function diff(patch: string, streaming = false): Block {
	let parsed = parseDiff(patch);
	let lines = Math.max(1, patch.split("\n").length);
	let separators = 0;
	if (parsed) {
		lines = 0;
		for (let hunk of parsed.hunks) {
			lines += hunk.unifiedLineCount;
			if (hunk.collapsedBefore > 0) separators++;
			if (hunk.noEOFCRAdditions || hunk.noEOFCRDeletions) lines++;
		}
		lines = Math.max(1, lines);
	}

	let height = PADDING_TOP + PADDING_BOTTOM + BORDER_Y + lines * LINE_HEIGHT
		+ separators * SEPARATOR_HEIGHT;
	let block: Block & { streaming: boolean } = {
		streaming,

		measure(width) {
			return { height, fit: width };
		},
		render() {
			return (
				<Diff
					patch={patch}
					streaming={block.streaming}
					height={height}
					file={parsed}
					hunkSeparators="metadata"
				/>
			);
		},
	};

	return block;
}

export { diff };
