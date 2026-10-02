import type { ComponentPropsWithoutRef } from "react";

import { Facepile, type FacepileAvatar } from "../facepile/facepile";
import { TypingDots } from "../typing-dots/typing-dots";
import { cn } from "../../lib/utils";

const DISCLAIMER = "Ace is AI and can make mistakes. Please double-check responses.";
const SHORT = "Ace is AI and can make mistakes.";
const NAMES: readonly string[] = [];
const AVATARS: FacepileAvatar[] = [];

type ChatStatusProps = ComponentPropsWithoutRef<"div"> & {
	typing?: readonly string[];
	avatars?: FacepileAvatar[];
	disclaimer?: string;
	onDisclaimerClose?: () => void;
};

function label(names: readonly string[]) {
	if (names.length === 0) return "";
	if (names.length === 1) return `${names[0]} is typing`;
	if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
	if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
	return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing`;
}

function ChatStatus(
	{
		typing = NAMES,
		avatars = AVATARS,
		disclaimer = DISCLAIMER,
		onDisclaimerClose,
		className,
		...props
	}: ChatStatusProps,
) {
	let text = typing.length > 0 && typing.length <= 3 ? label(typing) : "";
	let note = typing.length > 0 ? label(typing) : "";

	return (
		<div
			className={cn(
				"@container/status h-5 items-center overflow-hidden pt-0.5 text-[11px] leading-4 text-muted-foreground contain-strict",
				disclaimer
					? "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3"
					: "flex justify-between gap-3",
				className,
			)}
			{...props}
		>
			<div className="flex min-w-0 flex-1 items-center gap-1" aria-live="polite">
				{note && <span className="sr-only">{note}</span>}
				{avatars.length > 0 && (
					<Facepile
						avatars={avatars}
						max={6}
						size={16}
						gap={1}
						overlap={0.4}
						aria-hidden="true"
						className="shrink-0"
					/>
				)}
				{text && (
					<span
						className="inline-flex max-w-full items-baseline gap-0.5 @max-[245px]/status:hidden"
						aria-hidden="true"
					>
						<span className="truncate">{text}</span>
						<TypingDots aria-hidden="true" />
					</span>
				)}
			</div>
			{disclaimer && (
				<p
					className="min-w-0 truncate text-center text-muted-foreground/65"
					aria-label={disclaimer === DISCLAIMER ? disclaimer : undefined}
				>
					{disclaimer === DISCLAIMER
						? (
							<>
								<span className="@max-[560px]/status:hidden" aria-hidden="true">
									{disclaimer}
								</span>
								<span className="hidden @max-[560px]/status:inline" aria-hidden="true">
									{SHORT}
								</span>
							</>
						)
						: disclaimer}
					{onDisclaimerClose && (
						<>
							{" "}
							<button
								type="button"
								onClick={onDisclaimerClose}
								className="inline rounded-sm text-inherit underline underline-offset-2 outline-none transition-colors duration-100 hover:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/30"
							>
								<span aria-hidden="true">ok</span>
								<span className="sr-only">Hide AI disclaimer</span>
							</button>
						</>
					)}
				</p>
			)}
		</div>
	);
}

export { ChatStatus, type ChatStatusProps };
