import type { ComponentPropsWithRef, ReactNode } from "react";

import { Button } from "../../ui/button";
import { cn } from "../../lib/utils";

export type ApprovalViewProps = Omit<ComponentPropsWithRef<"section">, "onSubmit"> & {
	description: string;
	requester: ReactNode;
	args?: { key: string; value: string }[];
	detail: string;
	detailLabel?: string;
	count: number;
	disabled?: boolean;
	submitting?: boolean;
	error?: string;
	status?: string;
	actions?: ReactNode;
	denyLabel?: string;
	onApprove: () => void;
	onDeny: () => void;
};

/** Present an approval while its owner controls authorization and submission. */
export function ApprovalView(
	{
		description,
		requester,
		args = [],
		detail,
		detailLabel = "Details",
		count,
		disabled = false,
		submitting = false,
		error,
		status,
		actions,
		denyLabel = "No",
		onApprove,
		onDeny,
		className,
		...props
	}: ApprovalViewProps,
) {
	let extra = count > 1 ? count - 1 : 0;

	return (
		<section
			aria-label="Action approval"
			{...props}
			className={cn(
				"mb-2 rounded-xl squircle border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-composer",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-1">
				<p className="font-medium">{description}</p>
				<p className="text-xs text-muted-foreground">
					Requested by {requester}
					{extra > 0 && ` · ${extra} more pending`}
				</p>
			</div>

			{args.length > 0 && (
				<dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[auto_1fr]">
					{args.map(arg => (
						<div key={arg.key} className="contents">
							<dt className="text-muted-foreground">{arg.key}</dt>
							<dd className="min-w-0 truncate font-mono text-foreground/90">{arg.value}</dd>
						</div>
					))}
				</dl>
			)}

			<details className="mt-2 text-xs">
				<summary className="cursor-pointer select-none text-muted-foreground">
					{detailLabel}
				</summary>
				<pre className="mt-1 max-h-28 overflow-auto rounded-md bg-muted p-2 font-mono text-[0.6875rem] leading-4 whitespace-pre-wrap">
					{detail}
				</pre>
			</details>

			{(error || status) && (
				<p role={error ? "alert" : "status"} className="mt-2 text-xs text-muted-foreground">
					{error || status}
				</p>
			)}

			<div className="mt-2 flex flex-wrap gap-1.5">
				{actions}
				<Button size="sm" disabled={disabled || submitting} onClick={onApprove}>
					{submitting ? "Submitting…" : "Yes"}
				</Button>
				<Button size="sm" variant="secondary" disabled={disabled || submitting} onClick={onDeny}>
					{denyLabel}
				</Button>
			</div>
		</section>
	);
}
