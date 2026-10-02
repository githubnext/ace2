import type { ComponentPropsWithRef } from "react";

import { cn } from "../lib/utils";

function Skeleton({ className, ...props }: ComponentPropsWithRef<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("animate-pulse rounded-md squircle bg-muted", className)}
			{...props}
		/>
	);
}

export { Skeleton };
