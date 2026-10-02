import type { ComponentPropsWithRef } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { cn } from "../../lib/utils";
import { useMedia } from "../../hooks/use-media";
import { media } from "../../lib/screens";
import { TooltipProvider } from "../../ui/tooltip";

type Props = ComponentPropsWithRef<"div">;

/** List container for nav items with roving keyboard navigation. Shares tooltip timing across child links. */
function NavList({ className, ref, ...props }: Props) {
	let vertical = useMedia(media.sm);

	return (
		<TooltipProvider>
			<Toolbar.Root
				ref={ref}
				orientation={vertical ? "vertical" : "horizontal"}
				className={cn(
					"h-fit flex flex-row justify-start gap-0 sm:flex-col sm:overflow-y-auto sm:contain-paint sm:scroll-fade",
					className,
				)}
				{...props}
			/>
		</TooltipProvider>
	);
}

export { NavList };
