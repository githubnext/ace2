import { Button } from "../../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { IconDots } from "../../icons";

/** Additional ways to start a repository session. */
export function SessionOptions({ className, onContinuePr, onStartIssue }: {
	className?: string;
	onContinuePr?: () => void;
	onStartIssue?: () => void;
}) {
	if (!onContinuePr && !onStartIssue) return null;
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={
						<DropdownMenuTrigger
							render={
								<Button
									size="icon-sm"
									variant="ghost"
									className={className}
									aria-label="More options"
								>
									<IconDots className="size-3.5" />
								</Button>
							}
						/>
					}
				/>
				<TooltipContent side="right">More options</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="right" align="start" className="inline-52">
				{onContinuePr && (
					<DropdownMenuItem onClick={onContinuePr}>Continue a pull request…</DropdownMenuItem>
				)}
				{onStartIssue && (
					<DropdownMenuItem onClick={onStartIssue}>Start from an issue…</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
