import type { ComponentPropsWithRef } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "../lib/utils";
import { motion } from "./popup";

/** Root dropdown menu container. */
function DropdownMenu(props: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

/** Element that opens the dropdown menu when clicked. */
function DropdownMenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
	return (
		<MenuPrimitive.Trigger
			data-slot="dropdown-menu-trigger"
			className={cn(
				"outline-2 outline-offset-[-1px] outline-transparent focus-visible:outline-ring/50",
				className,
			)}
			{...props}
		/>
	);
}

/** Dropdown menu content panel with positioning and animations. */
function DropdownMenuContent({
	align = "start",
	alignOffset = 0,
	side = "bottom",
	sideOffset = 4,
	className,
	...props
}:
	& MenuPrimitive.Popup.Props
	& Pick<
		MenuPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>)
{
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="isolate z-50 outline-none"
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						"z-50 max-block-(--available-height) inline-(--anchor-width) min-inline-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-(--r-popover) squircle bg-popover p-1 text-popover-foreground shadow-popover outline-none",
						motion,
						className,
					)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
}

/** Groups related dropdown menu items. */
function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

/** Non-interactive label for a group of menu items. */
function DropdownMenuLabel({
	className,
	inset,
	...props
}: MenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}) {
	return (
		<MenuPrimitive.GroupLabel
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn(
				"px-2 py-1.5 text-xs text-muted-foreground data-inset:pl-7.5",
				className,
			)}
			{...props}
		/>
	);
}

/** Interactive menu item. Supports destructive variant for dangerous actions. */
function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: MenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<MenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"group/dropdown-menu-item relative flex min-h-7 cursor-default items-center gap-2 rounded-md squircle px-2 py-1 text-xs/relaxed outline-hidden select-none hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground dark:hover:bg-input dark:focus:bg-input data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:*:[svg]:text-destructive",
				className,
			)}
			{...props}
		/>
	);
}

/** Visual separator between menu items. */
function DropdownMenuSeparator({
	className,
	...props
}: MenuPrimitive.Separator.Props) {
	return (
		<MenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1 my-1 h-px bg-border/50", className)}
			{...props}
		/>
	);
}

/** Right-aligned shortcut hint text within a menu item. */
function DropdownMenuShortcut({
	className,
	...props
}: ComponentPropsWithRef<"span">) {
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn(
				"ml-auto text-[0.625rem] tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
};
