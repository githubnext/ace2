import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "../lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"inline-flex h-4.5 w-8 shrink-0 items-center rounded-full bg-input p-0.5 outline-2 outline-offset-2 outline-transparent transition-colors duration-150 focus-visible:outline-ring/50 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="size-3.5 rounded-full bg-background shadow-xs transition-transform duration-150 data-checked:translate-x-3.5 motion-reduce:transition-none"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
