import type { ComponentPropsWithRef, CSSProperties } from "react";

import { cn } from "../lib/utils";

import "./badge.css";

/**
 * Renders a notification dot on top of its children, masking the icon
 * underneath so the dot works on any background.
 *
 * Override `--s` to change the dot size (default 7px), or `--badge-color`
 * to change the dot color (default accent).
 *
 * Pass `pulse` to animate the dot with a gentle scale + filter cycle
 * (used for transient connection states like reconnecting).
 */
function Badge({
	show = true,
	pulse = false,
	className,
	children,
	...props
}: ComponentPropsWithRef<"span"> & {
	/** Whether the badge dot is visible */
	show?: boolean;
	/** Animate the dot with a subtle pulse */
	pulse?: boolean;
}) {
	let animate = show && pulse;
	return (
		<span
			data-slot="badge"
			data-show={show || undefined}
			className={cn(
				"group/badge relative inline-grid contain-layout",
				"[--s:7px] [--g:calc(var(--s)*0.375)] [--f:calc(var(--s)*0.125)] [--c:calc(var(--s)/2)] [--r:calc(var(--c)+var(--g))]",
				"[--badge-color:var(--color-accent)]",
				className,
			)}
			{...props}
		>
			<span
				className="mask-[radial-gradient(circle_var(--mask-r)_at_top_var(--c)_right_var(--c),transparent_calc(100%-var(--f)),black_100%)] transition-[--mask-r] duration-350 ease-spring"
				style={{ "--mask-r": show ? "var(--r)" : "0px" } as CSSProperties}
			>
				{children}
			</span>
			<span
				className={cn(
					"absolute top-0 right-0 aspect-square rounded-full bg-(--badge-color) w-(--s) transition-[transform,opacity] duration-350 ease-spring",
					animate && "animate-[badge-pulse_1.4s_cubic-bezier(.45,0,.55,1)_infinite]",
				)}
				style={{
					transform: animate ? undefined : (show ? "scale(1)" : "scale(0.15)"),
					opacity: show ? 1 : 0,
				}}
			/>
		</span>
	);
}

export { Badge };
