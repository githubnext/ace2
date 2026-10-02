import type { ReactNode } from "react";

import { Button, useLayoutLeft } from "@ace/ui";
import { IconSidebar } from "@ace/ui/icons";

const lead =
	"shrink-0 rounded-none! rounded-tl-[calc(var(--r-window)-3px)]! active:not-aria-[haspopup]:translate-y-0! active:scale-95 [&[aria-expanded=true]:not(:hover)]:!bg-transparent electrobun-webkit-app-region-no-drag";

/** The channel's title bar: the sidebar toggle, then each top pane's tab strip in its column. */
export function Bar({ children }: { children?: ReactNode }) {
	const left = useLayoutLeft();

	return (
		<header className="relative col-[1/-1] grid h-8 shrink-0 items-center overflow-hidden border-b border-border text-sm font-medium text-foreground contain-style [grid-template-columns:subgrid] electrobun-webkit-app-region-drag">
			<div className="absolute inset-y-0 left-0 z-20 flex w-8 shrink-0 items-center justify-center border-r border-border bg-background contain-strict">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Toggle channels sidebar"
					aria-expanded={left.open}
					className={lead}
					onClick={() => left.setOpen((open) => !open)}
				>
					<IconSidebar className="size-4" />
				</Button>
			</div>
			{children}
		</header>
	);
}
