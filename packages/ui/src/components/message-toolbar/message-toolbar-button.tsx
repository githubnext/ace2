import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";

type MessageToolbarButtonProps =
	& Omit<ComponentPropsWithRef<typeof Button>, "children" | "size" | "variant">
	& {
		active?: boolean;
		destructive?: boolean;
		icon: ReactNode;
	};

function MessageToolbarButton(
	{
		active,
		className,
		destructive,
		icon,
		title,
		type = "button",
		...props
	}: MessageToolbarButtonProps,
) {
	let label = typeof props["aria-label"] === "string" ? props["aria-label"] : undefined;

	return (
		<Button
			{...props}
			type={type}
			variant="ghost"
			size="icon-xs"
			aria-pressed={active || undefined}
			title={title || label}
			className={cn(
				"duration-75 hover:bg-secondary/70 active:scale-95 aria-pressed:bg-secondary aria-pressed:text-foreground",
				!destructive && "text-muted-foreground",
				destructive
					&& "text-destructive hover:bg-destructive/10 hover:text-destructive",
				className,
			)}
		>
			{icon}
		</Button>
	);
}

export { MessageToolbarButton };
export type { MessageToolbarButtonProps };
