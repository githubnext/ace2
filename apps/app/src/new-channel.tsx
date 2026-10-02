import { useId, useState } from "react";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
	Input,
} from "@ace/ui";

import { desktop } from "./desktop";

type Props = {
	onCreate: (project: string) => Promise<void>;
	disabled?: boolean;
	dialog?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSettings?: () => void;
};

const DESCRIPTION =
	"Channels run on this machine. Agents work in lanes: worktrees of the project's Git repository.";

/** Starts a channel in a project folder, as the empty state or as a dialog. */
export function NewChannel({ onCreate, disabled, dialog, open, onOpenChange, onSettings }: Props) {
	const id = useId();
	const [path, setPath] = useState("");
	const [pending, setPending] = useState<"folder" | "channel">();
	const [error, setError] = useState("");

	async function choose() {
		if (!desktop) return;
		setPending("folder");
		setError("");
		try {
			const selected = await desktop.project();
			if (selected) setPath(selected);
		} catch (error) {
			setError((error as Error).message);
		} finally {
			setPending(undefined);
		}
	}

	async function create() {
		if (!path.trim() || disabled || pending) return;
		setPending("channel");
		setError("");
		try {
			await onCreate(path.trim());
			onOpenChange?.(false);
		} catch (error) {
			setError((error as Error).message);
		} finally {
			setPending(undefined);
		}
	}

	const form = (
		<form
			id={id}
			className="flex w-full max-w-md flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				void create();
			}}
		>
			<div className="flex gap-2">
				<Input
					autoFocus
					aria-label="Project folder"
					placeholder="~/code/project"
					value={path}
					disabled={!!pending}
					onChange={(event) => setPath(event.target.value)}
				/>
				{desktop && (
					<Button
						type="button"
						variant="outline"
						disabled={!!pending}
						onClick={() => void choose()}
					>
						{pending === "folder" ? "Choosing…" : "Choose folder…"}
					</Button>
				)}
			</div>
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			{!dialog && (
				<Button type="submit" disabled={disabled || !!pending || !path.trim()}>
					{pending === "channel" ? "Starting…" : "Start channel"}
				</Button>
			)}
		</form>
	);
	if (!dialog) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Start a channel</EmptyTitle>
					<EmptyDescription>{DESCRIPTION}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{form}
					{onSettings && <Button variant="ghost" onClick={onSettings}>Provider settings</Button>}
				</EmptyContent>
			</Empty>
		);
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a project</DialogTitle>
					<DialogDescription>{DESCRIPTION}</DialogDescription>
				</DialogHeader>
				{form}
				<DialogFooter>
					{onSettings && <Button variant="ghost" onClick={onSettings}>Provider settings</Button>}
					<Button type="submit" form={id} disabled={disabled || !!pending || !path.trim()}>
						{pending === "channel" ? "Starting…" : "Start channel"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
