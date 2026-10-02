import type { ComponentPropsWithRef } from "react";

import { cn } from "../lib/utils";

type DivProps = ComponentPropsWithRef<"div">;
type Props =
	& DivProps
	& {
		/** Whether the divider is visible. Defaults to `true`. */
		active?: boolean;
	}
	& (
		| { vertical: true; horizontal?: never }
		| { horizontal: true; vertical?: never }
		| { vertical?: never; horizontal?: never }
	);

/** Visual divider line — vertical or horizontal. */
function Divider({ className, ref, vertical, horizontal, active, ...props }: Props) {
	let v = vertical || !horizontal;
	return (
		<div
			ref={ref}
			role="separator"
			aria-orientation={v ? "vertical" : "horizontal"}
			data-slot="divider"
			data-active={active || undefined}
			className={cn(
				// layout
				"relative contain-layout",
				// sizing
				v ? "w-0.5 h-full" : "h-0.5 w-full",
				// hit area
				v
					? "before:absolute before:inset-y-0 before:-inset-x-2"
					: "before:absolute before:inset-x-0 before:-inset-y-2",
				// background
				v
					? "bg-linear-to-r from-black/10 dark:from-white/15 to-white/50 dark:to-black/35"
					: "bg-linear-to-b from-black/10 dark:from-white/15 to-white/50 dark:to-black/35",
				// active highlight — layout + sizing
				v
					? "after:absolute after:inset-y-0 after:left-0 after:w-px"
					: "after:absolute after:inset-x-0 after:top-0 after:h-px",
				// active highlight — color
				v
					? "after:bg-linear-to-b after:from-transparent after:via-primary after:to-transparent"
					: "after:bg-linear-to-r after:from-transparent after:via-primary after:to-transparent",
				// active highlight — motion
				"after:opacity-0 after:transition-opacity after:duration-100",
				// active highlight — state
				"data-active:after:opacity-100", /* hover:after:opacity-100 */
				className,
			)}
			{...props}
		/>
	);
}

export { Divider };
