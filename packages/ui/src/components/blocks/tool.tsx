import type { Block } from "../../lib/block";
import { image as imageBlock } from "./image";
import { RESULT_PAD_X, RESULT_PAD_Y, resultFrame, ROW_HEIGHT, type ToolData } from "./tool-layout";
import { ToolView } from "./tool-view";

/** Tool call block. Fixed height when collapsed, expands to show result. */
function tool(data: ToolData, expanded = false, resultExpanded = false, settling = false): Block {
	let images = expanded || settling ? imageResult(data) : undefined;
	return {
		key: `tool:${data.id}`,
		measure(width) {
			let result = resultFrame(data, expanded, resultExpanded, width);
			let h = ROW_HEIGHT;
			if (expanded && result.height > 0) h += result.height;
			if (expanded && images) h += images.measure(width).height;
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
					images={images}
					width={width}
				/>
			);
		},
	};
}

function imageResult(data: ToolData): Block | undefined {
	if (!data.images?.length) return;
	let blocks = data.images.map((src, index) => ({
		key: `${data.id}:${index}`,
		block: imageBlock(src, 0, 0, `Image returned by ${data.name}`, "contain"),
	}));
	let inner = (width: number) => Math.max(0, width - RESULT_PAD_X * 2 - 2);
	let measure = (width: number) => ({
		height: blocks.reduce((sum, { block }) => sum + block.measure(inner(width)).height, 0)
			+ RESULT_PAD_Y * (blocks.length + 1) + 1,
		fit: width,
	});
	return {
		measure,
		render(width) {
			return (
				<div
					className="box-border flex flex-col rounded-b-md squircle overflow-hidden border-x border-b border-border bg-code contain-content"
					style={{
						blockSize: measure(width).height,
						padding: `${RESULT_PAD_Y}px ${RESULT_PAD_X}px`,
						gap: RESULT_PAD_Y,
					}}
				>
					{blocks.map(({ key, block }) => <div key={key}>{block.render(inner(width))}</div>)}
				</div>
			);
		},
	};
}

export { tool };
export type { ToolData } from "./tool-layout";
