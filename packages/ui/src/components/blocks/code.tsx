import type { ComarkNode } from "comark";
import type { Block } from "../../lib/block";

import { CodeView } from "./code-view";
import { CODE_LABEL_HEIGHT as LABEL_HEIGHT, CODE_LINE_HEIGHT, CODE_PADDING } from "./constants";

/** Fenced code block with syntax label. */
function code(source: string, language?: string, streaming = false, nodes?: ComarkNode[]): Block {
	let lines = source.split("\n").length;
	let height = lines * CODE_LINE_HEIGHT + CODE_PADDING * 2 + (language ? LABEL_HEIGHT : 0);
	let block: Block & { streaming: boolean } = {
		streaming,

		measure(width) {
			return { height, fit: width };
		},
		render() {
			return (
				<CodeView
					source={source}
					language={language}
					streaming={block.streaming}
					nodes={nodes}
					height={height}
				/>
			);
		},
	};

	return block;
}

export { code };
