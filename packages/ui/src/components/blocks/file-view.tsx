import { FILE_HEIGHT } from "./constants";

function FileView({ name, size }: { name: string; size: string }) {
	return (
		<div
			className="flex min-w-0 items-center gap-3 overflow-hidden rounded-lg squircle border border-border px-3 contain-strict"
			style={{ blockSize: FILE_HEIGHT }}
		>
			<div className="shrink-0 text-lg">📄</div>
			<div className="flex min-w-0 flex-col">
				<span className="truncate text-sm text-foreground">{name}</span>
				<span className="truncate text-xs text-muted-foreground">{size}</span>
			</div>
		</div>
	);
}

export { FileView };
