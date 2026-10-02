import type { Block } from "../../lib/block";
import { resultFrame, ROW_HEIGHT, type ToolData } from "./tool-layout";
import { ToolView } from "./tool-view";

/** Tool call block. Fixed height when collapsed, expands to show result. */
function tool(data: ToolData, expanded = false, resultExpanded = false, settling = false): Block {
	return {
		key: `tool:${data.id}`,
		measure(width) {
			let result = resultFrame(data, expanded, resultExpanded, width);
			let h = ROW_HEIGHT;
			if (expanded && result.height > 0) h += result.height;
			return { height: h, fit: width };
		},
		render(width) {
			let result = resultFrame(data, expanded, resultExpanded, width);
			return (
				<ToolView
					data={data}
					expanded={expanded}
					settling={settling}
					height={result.height}
					clipped={result.clipped}
					diff={result.diff}
					width={width}
				/>
			);
		},
	};
}

export { tool };
export type { ToolData } from "./tool-layout";
