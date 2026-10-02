import type { ComponentPropsWithRef, ReactNode } from "react";

import { useLayoutNav } from "../layout/layout";
import { cn } from "../../lib/utils";

/** Access the nav state from any child component. */
function useNav() {
	return useLayoutNav();
}

type Props = ComponentPropsWithRef<"nav"> & {
	footer?: ReactNode;
	header?: ReactNode;
};

/**
 * Application nav with grouped navigation and optional footer.
 * Must be used within a Layout component.
 */
function Nav({
	footer,
	header,
	children,
	className,
	ref,
	...props
}: Props) {
	let { open } = useNav();

	return (
		<nav
			ref={ref}
			data-axis="x"
			data-state={open ? "expanded" : "collapsed"}
			className={cn(
				"px-0.5 -mx-0.5 @container/nav group/nav layout:nav gap-2 sm:pr-2 relative max-sm:scroll-fade electrobun-webkit-app-region-no-drag",
				className,
			)}
			{...props}
		>
			{header && <header>{header}</header>}
			{children}
			{footer && (
				<footer className="flex shrink-0 max-sm:relative max-sm:z-1 sm:mt-auto sm:row-start-3 sm:self-end">
					{footer}
				</footer>
			)}
		</nav>
	);
}

export { Nav };
