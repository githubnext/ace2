import type { ComponentPropsWithRef } from "react";

import { cn } from "../../lib/utils";

import "./typing-dots.css";

type TypingDotsProps = ComponentPropsWithRef<"span">;

function TypingDots({ className, ref, ...props }: TypingDotsProps) {
	return (
		<span
			ref={ref}
			data-slot="typing-dots"
			className={cn(
				"inline-block shrink-0 whitespace-nowrap align-baseline leading-none [--dot-gap:0.14em] [--dot-lift:0.09em] [--dot-size:0.22em]",
				className,
			)}
			{...props}
		>
			<span className="typing-dots-dot rounded-full bg-current" />
			<span className="typing-dots-dot rounded-full bg-current" />
			<span className="typing-dots-dot rounded-full bg-current" />
		</span>
	);
}

export { TypingDots, type TypingDotsProps };
