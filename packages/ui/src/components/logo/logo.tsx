import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export type LogoProps = ComponentProps<"svg">;

export function Logo({ className, ...props }: LogoProps) {
	return (
		<svg
			aria-label="Ace"
			className={cn("size-16", className)}
			fill="none"
			viewBox="0 0 1024 1024"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<path
				fill="currentColor"
				d="M175.858 759.807C158.796 759.807 148.165 741.299 156.763 726.562L491.942 151.968C500.472 137.344 521.602 137.344 530.133 151.968L603.056 276.98C607.076 283.869 607.071 292.39 603.045 299.275L340.213 748.858C336.249 755.639 328.983 759.807 321.129 759.807H175.858Z"
			/>
			<path
				fill="currentColor"
				d="M696.026 454.468C703.889 454.468 711.16 458.644 715.122 465.435L867.442 726.563C876.043 741.3 865.417 759.808 848.348 759.808H703.083C695.226 759.808 687.96 755.638 683.996 748.854L531.415 487.728C522.805 472.99 533.434 454.468 550.503 454.468H696.026Z"
			/>
		</svg>
	);
}
