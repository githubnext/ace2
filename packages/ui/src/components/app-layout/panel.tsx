import type { ComponentPropsWithRef } from "react";
import { cn } from "../../lib/utils";

type Props = ComponentPropsWithRef<"main">;

/** Main content area beside the nav. */
function Panel({ className, ref, ...props }: Props) {
	return (
		<main
			ref={ref}
			className={cn(
				// no-drag prevents this area from initiating native window drag
				"utils:panel panel-inset relative flex flex-col electrobun-webkit-app-region-no-drag",
				className,
			)}
			{...props}
		/>
	);
}

export { Panel };
