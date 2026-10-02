import { useId, useState } from "react";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@ace/ui";
import { IconFolderSearch } from "@ace/ui/icons";

import { desktop } from "./desktop";

export function EmptyProjects({ onOpen, disabled }: { onOpen: () => void; disabled: boolean }) {
	return (
		<div className="mx-auto flex min-h-full w-full max-w-[42rem] flex-col justify-center px-5 py-10">
			<div className="flex flex-col items-center gap-5 text-center">
				<div className="grid size-10 place-items-center rounded-md border border-border/70 bg-muted/40 text-muted-foreground">
					<IconFolderSearch className="size-5" aria-hidden />
				</div>
				<div className="flex flex-col gap-2">
					<h1 className="text-xl font-medium tracking-normal">Open a project</h1>
					<p className="text-sm leading-6 text-muted-foreground">Choose a folder to get started.</p>
				</div>
				<Button onClick={onOpen} disabled={disabled}>
					<IconFolderSearch aria-hidden data-icon="inline-start" />
					Open folder…
					{desktop && <kbd className="ml-2 text-xs opacity-60">⌘O</kbd>}
				</Button>
			</div>
		</div>
	);
}

/** Browsers cannot pick a host directory; the desktop uses the native folder dialog. */
export function OpenProject({ onOpen, onClose }: {
	onOpen: (path: string) => Promise<void>;
	onClose: () => void;
}) {
	const id = useId();
	const [path, setPath] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function open() {
		if (busy || !path.trim()) return;
		setBusy(true);
		setError("");
		try {
			await onOpen(path.trim());
			onClose();
		} catch (error) {
			setError((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(value) => {
				if (!value) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Open a folder</DialogTitle>
					<DialogDescription>Enter the folder’s path on this host.</DialogDescription>
				</DialogHeader>
				<form
					id={id}
					onSubmit={(event) => {
						event.preventDefault();
						void open();
					}}
				>
					<Input
						autoFocus
						aria-label="Project folder"
						placeholder="~/code/project"
						value={path}
						disabled={busy}
						onChange={(event) => setPath(event.target.value)}
					/>
					{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
				</form>
				<DialogFooter>
					<Button type="submit" form={id} disabled={busy || !path.trim()}>
						{busy ? "Opening…" : "Open folder"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
