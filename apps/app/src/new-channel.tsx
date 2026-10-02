import { useState } from "react";

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

type Props = {
	onCreate: (project: string) => void;
	dialog?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

const DESCRIPTION =
	"Channels run on this machine. Agents work in lanes: worktrees of the project's Git repository.";

/** Starts a channel in a project folder, as the empty state or as a dialog. */
export function NewChannel({ onCreate, dialog, open, onOpenChange }: Props) {
	const [path, setPath] = useState("");
	const form = (
		<form
			className="flex w-full max-w-md gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (path.trim()) onCreate(path.trim());
			}}
		>
			<Input
				autoFocus
				placeholder="~/code/project"
				value={path}
				onChange={(event) => setPath(event.target.value)}
			/>
			{!dialog && <Button type="submit" disabled={!path.trim()}>Start channel</Button>}
		</form>
	);
	if (!dialog) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Start a channel</EmptyTitle>
					<EmptyDescription>{DESCRIPTION}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>{form}</EmptyContent>
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
					<Button disabled={!path.trim()} onClick={() => onCreate(path.trim())}>
						Start channel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
