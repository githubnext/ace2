import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "../lib/utils";
import { motion } from "./popup";

/** Popover root — manages open state. */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

/** Popover trigger element. */
function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/** Renders children into a portal. */
function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
	return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

/** Positions the popup relative to the anchor or trigger. */
function PopoverPositioner({ ...props }: PopoverPrimitive.Positioner.Props) {
	return (
		<PopoverPrimitive.Positioner
			data-slot="popover-positioner"
			{...props}
		/>
	);
}

/** The popup surface with default styling. */
function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
	return (
		<PopoverPrimitive.Popup
			data-slot="popover-content"
			className={cn(
				"z-50 min-inline-40 origin-(--transform-origin) rounded-(--r-popover) squircle bg-popover p-1 text-popover-foreground shadow-popover outline-none",
				motion,
				className,
			)}
			{...props}
		/>
	);
}

/** Convenience: Portal + Positioner + Popup in one. */
function PopoverContent({ className, ...props }: PopoverPrimitive.Popup.Props) {
	return (
		<PopoverPortal>
			<PopoverPositioner>
				<PopoverPopup className={className} {...props} />
			</PopoverPositioner>
		</PopoverPortal>
	);
}

export { Popover, PopoverContent, PopoverPopup, PopoverPortal, PopoverPositioner, PopoverTrigger };
