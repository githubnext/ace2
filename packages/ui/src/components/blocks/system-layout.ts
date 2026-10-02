import { SYSTEM_HEIGHT } from "./constants";

const OUTPUT = 16;
const OUTPUT_LINE = 18;
const OUTPUT_PAD = 8;
const PREVIEW_HEIGHT = SYSTEM_HEIGHT;
const TERMINAL_PAD_X = 12;
const TERMINAL_PAD_Y = 5;
const TERMINAL_JOIN_PAD_Y = 2.5;
const LABEL_INSET = 4;
const ACTION_HEIGHT = 34;
const ACTION_PAD_X = 14;

type ExecAction = "view" | "copy" | "send" | "abort";

type ExecActionState = {
	hasOutput: boolean;
};

type ExecStatusState = {
	aborted?: boolean;
	exitCode?: number | string;
};

type ExecStatusSlot = "abort" | "passed" | "failed" | "aborted";

type ExecActionPayload = {
	id: string;
	input: string;
	cwd?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number | string;
	aborted?: boolean;
};

type ExecActionHandler = (action: ExecAction, exec: ExecActionPayload) => void;

function execActions(state: ExecActionState): ExecAction[] {
	let actions: ExecAction[] = [];
	if (state.hasOutput) actions.push("view", "copy", "send");
	return actions;
}

function execStatusSlot(state: ExecStatusState): ExecStatusSlot {
	if (state.aborted) return "aborted";
	if (state.exitCode === undefined) return "abort";
	return state.exitCode === 0 ? "passed" : "failed";
}

function output(input: string, stdout: string, stderr: string): string[] {
	let text = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
	if (!text) return [];
	let lines = text.split(/\r?\n/);
	while (lines.at(-1)?.trim() === "") lines.pop();
	let first = lines[0]?.replace(/^\s*(?:[$>]\s*)?/, "").trim();
	if (first === input.trim()) lines = lines.slice(1);
	while (lines.at(-1)?.trim() === "") lines.pop();
	return lines;
}

export {
	ACTION_HEIGHT,
	ACTION_PAD_X,
	type ExecAction,
	type ExecActionHandler,
	type ExecActionPayload,
	execActions,
	execStatusSlot,
	LABEL_INSET,
	OUTPUT,
	output,
	OUTPUT_LINE,
	OUTPUT_PAD,
	PREVIEW_HEIGHT,
	TERMINAL_JOIN_PAD_Y,
	TERMINAL_PAD_X,
	TERMINAL_PAD_Y,
};
