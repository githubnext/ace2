import { IconX } from "../../icons";
import { Button } from "../../ui/button";

export type SessionDetailsViewProps = {
	summary?: string;
	onClose: () => void;
};

export function SessionDetailsView({ summary, onClose }: SessionDetailsViewProps) {
	return (
		<aside
			aria-label="Channel details"
			className="flex h-full w-full min-w-0 max-w-full flex-col gap-2 overflow-y-auto py-2.5 pr-2 pl-4"
		>
			<div className="flex min-w-0 items-center justify-between gap-2">
				<h2 className="text-xs font-medium text-muted-foreground">Summary</h2>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label="Close details sidebar"
					onClick={onClose}
				>
					<IconX aria-hidden />
				</Button>
			</div>
			<p className="text-sm leading-snug whitespace-pre-wrap break-words text-foreground">
				{summary || "No summary yet."}
			</p>
		</aside>
	);
}
