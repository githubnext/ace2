import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./dropdown-menu";
import { IconChevronDown } from "../icons";

type ButtonProps = ComponentPropsWithRef<typeof Button>;
type ContentProps = ComponentPropsWithRef<typeof DropdownMenuContent>;

type SplitButtonProps =
	& Omit<ButtonProps, "children">
	& Pick<ContentProps, "align" | "alignOffset" | "side" | "sideOffset">
	& {
		children: ReactNode;
		contentClassName?: string;
		menu: ReactNode;
		menuLabel?: string;
		primaryClassName?: string;
		triggerClassName?: string;
	};

function SplitButton({
	align = "end",
	alignOffset,
	children,
	className,
	contentClassName,
	disabled,
	menu,
	menuLabel = "More options",
	primaryClassName,
	side,
	sideOffset,
	triggerClassName,
	variant = "default",
	size = "default",
	...props
}: SplitButtonProps) {
	let ghost = variant === "ghost";
	let ghostBorder = "border border-transparent";

	return (
		<div className={cn("group/split-button inline-flex shrink-0 items-stretch", className)}>
			<Button
				className={cn(
					ghost ? "rounded-md" : "rounded-r-none",
					ghost && ghostBorder,
					primaryClassName,
				)}
				disabled={disabled}
				size={size}
				variant={variant}
				{...props}
			>
				{children}
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							aria-label={menuLabel}
							className={cn(
								ghost ? "rounded-md" : "rounded-l-none",
								"px-1.5",
								ghost && ghostBorder,
								triggerClassName,
							)}
							disabled={disabled}
							size={size}
							variant={variant}
						>
							<IconChevronDown className="size-3.5" aria-hidden />
						</Button>
					}
				/>
				<DropdownMenuContent
					align={align}
					alignOffset={alignOffset}
					className={contentClassName}
					side={side}
					sideOffset={sideOffset}
				>
					{menu}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

export { SplitButton };
export type { SplitButtonProps };
