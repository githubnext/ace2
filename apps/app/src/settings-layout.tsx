import type { ComponentProps, ReactNode } from "react";

/** A titled list of rows separated by hairlines, without a surrounding card. */
export function Group(
	{ title, description, children }: {
		title?: string;
		description?: ReactNode;
		children: ReactNode;
	},
) {
	return (
		<section className="flex flex-col" aria-label={title}>
			{title && <h3 className="pb-1 text-xs font-medium text-muted-foreground">{title}</h3>}
			{description && <p className="pb-2 text-xs/relaxed text-muted-foreground">{description}</p>}
			<div className="flex flex-col divide-y divide-border/60">{children}</div>
		</section>
	);
}

/** Label and description on the left, compact controls on the right; stacks in narrow panes. */
export function Row({ label, description, children, footer, id }: {
	label: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	/** Full-width content under the row: inline forms, confirmations, and action results. */
	footer?: ReactNode;
	id?: string;
}) {
	return (
		<div className="flex flex-col gap-2 py-3">
			<div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:justify-between @md:gap-6">
				<div className="flex min-w-0 flex-col gap-0.5">
					<div id={id} className="text-xs font-medium text-foreground">{label}</div>
					{description && (
						<div className="text-xs/relaxed text-pretty text-muted-foreground">{description}</div>
					)}
				</div>
				{children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
			</div>
			{footer}
		</div>
	);
}

/** Secondary detail that should not dominate common settings. */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
	return (
		<details className="group/details py-3 text-xs">
			<summary className="w-fit cursor-pointer rounded-sm text-muted-foreground outline-none select-none marker:text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
				{summary}
			</summary>
			<div className="flex flex-col gap-3 pt-3">{children}</div>
		</details>
	);
}

export function Select({ className, ...props }: ComponentProps<"select">) {
	return (
		<select
			className={`h-7 max-w-full min-w-28 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 ${
				className || ""
			}`}
			{...props}
		/>
	);
}

export function Status({ children }: { children: ReactNode }) {
	return <p role="status" className="text-xs/relaxed text-muted-foreground">{children}</p>;
}

export function Problem({ children }: { children: ReactNode }) {
	return <p role="alert" className="text-xs/relaxed break-words text-destructive">{children}</p>;
}
