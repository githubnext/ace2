import { cva } from "class-variance-authority";
import { hitArea } from "./hit-area";
import { cn } from "./utils";

export const buttonVariants = cva(
	cn(
		hitArea,
		"group/button inline-flex shrink-0 items-center justify-center rounded-md squircle text-xs/relaxed font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 ease-out select-none contain-layout outline-2 outline-offset-[-1px] outline-transparent focus-visible:outline-ring/50 active:not-aria-[haspopup]:translate-y-px motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 **:data-[slot=kbd]:hidden **:[@media(hover:hover)]:data-[slot=kbd]:inline-flex **:data-[slot=kbd]:size-4 **:data-[slot=kbd]:items-center **:data-[slot=kbd]:justify-center **:data-[slot=kbd]:rounded **:data-[slot=kbd]:bg-current/10 **:data-[slot=kbd]:text-[0.6875rem] **:data-[slot=kbd]:font-medium **:data-[slot=kbd]:leading-4 **:data-[slot=kbd]:opacity-60",
	),
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground shadow-button-primary hover:bg-primary-hover",
				outline:
					"shadow-button-neutral hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
				secondary:
					"bg-secondary text-secondary-foreground shadow-button-neutral hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground dark:hover:bg-muted/50",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-7 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				xs:
					"h-5 gap-1 rounded-sm px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
				sm:
					"h-6 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				lg:
					"h-8 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
				icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
				"icon-sm": "size-6.5 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);
