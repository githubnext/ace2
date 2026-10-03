import {
	Button,
	Popover,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
	PopoverTrigger,
} from "@ace/ui";
import type { Usage as Totals } from "@ace/channel/protocol";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat("en-US");
const dollars = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});

function cost(value: number): string {
	return value > 0 && value < 0.0001 ? "<$0.0001" : dollars.format(value);
}

export function Usage({ value }: { value: Totals }) {
	const rows = [
		["Input", value.input],
		["Output", value.output],
		["Cache read", value.cacheRead],
		["Cache write", value.cacheWrite],
		["Total tokens", value.totalTokens],
	] as const;
	return (
		<div className="flex justify-end pt-1">
			<Popover>
				<PopoverTrigger
					aria-label="Chat usage"
					render={
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-xs font-normal tabular-nums text-muted-foreground"
						/>
					}
				>
					{compact.format(value.totalTokens)} tokens · {cost(value.cost)} est.
				</PopoverTrigger>
				<PopoverPortal>
					<PopoverPositioner side="top" align="end" sideOffset={8}>
						<PopoverPopup className="w-64 p-4 text-xs" aria-label="Chat usage">
							<h3 className="mb-3 text-sm font-medium">Chat usage</h3>
							<dl className="space-y-2">
								{rows.map(([label, count]) => (
									<div key={label} className="flex justify-between gap-4">
										<dt className="text-muted-foreground">{label}</dt>
										<dd className="tabular-nums">{exact.format(count)}</dd>
									</div>
								))}
								<div className="flex justify-between gap-4 border-t pt-2">
									<dt className="text-muted-foreground">Estimated cost (USD)</dt>
									<dd className="tabular-nums">{cost(value.cost)}</dd>
								</div>
							</dl>
							<p className="mt-3 leading-relaxed text-muted-foreground">
								All requests in this chat. Cost uses model list prices; your provider's bill may
								differ.
							</p>
						</PopoverPopup>
					</PopoverPositioner>
				</PopoverPortal>
			</Popover>
		</div>
	);
}
