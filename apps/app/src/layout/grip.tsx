import type { PointerEvent } from "react";

import * as Split from "@ace/split-tabs";

type Props = {
	handle: Split.Handle;
	frozen: boolean;
	onStart: (event: PointerEvent<HTMLButtonElement>, handle: Split.Handle) => void;
};

export function Grip({ handle, frozen, onStart }: Props) {
	return (
		<button
			type="button"
			aria-label={handle.axis === "col" ? "Resize columns" : "Resize rows"}
			data-axis={handle.axis}
			className={`layout-grip z-30 touch-none rounded-full bg-transparent outline-none contain-strict ${
				frozen ? "pointer-events-none" : ""
			} ${
				handle.axis === "col"
					? "w-3 -translate-x-1/2 cursor-col-resize"
					: "h-3 -translate-y-1/2 cursor-row-resize"
			}`}
			style={{ gridArea: Split.place(handle) }}
			onPointerDown={(event) => onStart(event, handle)}
		/>
	);
}
