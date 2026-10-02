import type { ReactNode } from "react";

/** Collapsible side panel that hosts the diff panel's file tree. */
function FileTreeShell({
	children,
	open,
}: {
	children: ReactNode;
	open: boolean;
}) {
	return (
		<aside
			className="min-h-0 overflow-hidden border-l border-transparent bg-background opacity-0 data-[open=true]:border-border data-[open=true]:opacity-100 @max-[46rem]/diff:border-l-0 @max-[46rem]/diff:border-t"
			data-open={open ? true : undefined}
			aria-hidden={!open}
			inert={!open ? true : undefined}
		>
			{children}
		</aside>
	);
}

export { FileTreeShell };
