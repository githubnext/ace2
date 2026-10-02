import {
	type ComponentPropsWithRef,
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	useImperativeHandle,
	useLayoutEffect,
	useState,
} from "react";

import { Button } from "../../ui/button";
import { cn } from "../../lib/utils";

import { isAnswered } from "./question-state";

export type QuestionItem = {
	id: string;
	header: string;
	question: string;
	options: { id: string; label: string; description: string }[];
	multiple: boolean;
};
export type QuestionDraft = Record<string, {
	mode: "choices" | "custom";
	choice: string | null;
	options: Record<string, boolean>;
	custom: string;
}>;
export type QuestionForm = {
	definition: { questions: QuestionItem[] };
	view?: QuestionDraft;
	disabled: boolean;
	submitting: boolean;
	syncing?: boolean;
	error?: string;
	validation?: string;
	status?: string;
	actions?: ReactNode;
	choose: (id: string, option: string, multiple: boolean, checked: boolean) => void;
	focus?: (id: string, field: "choices" | "custom") => void;
	blur?: () => void;
	submit: () => void | Promise<void>;
	retry?: () => void;
	custom?: (question: QuestionItem) => ReactNode;
	presence?: (id: string) => { count: number; content: ReactNode } | undefined;
};
export type QuestionViewHandle = { invalid: (id: string) => void };
export type QuestionViewProps = Omit<ComponentPropsWithRef<"section">, "id" | "title"> & {
	id: string;
	count: number;
	requester: ReactNode;
	title?: string;
	form: QuestionForm;
	handle?: Ref<QuestionViewHandle>;
};

/** Controlled questionnaire presentation; transport and shared editing stay in adapters. */
export function QuestionView(
	{ id, count, requester, title = "Ace needs your input", form, handle, className, ...props }:
		QuestionViewProps,
) {
	let [selected, setActive] = useState<string>();
	let [focusRequest, setFocusRequest] = useState<{
		id: string;
		target: "tab" | "answer";
	}>();
	function invalid(id: string) {
		setActive(id);
		setFocusRequest({ id, target: "tab" });
	}
	let { definition, view, syncing, blur } = form;
	useImperativeHandle(handle, () => ({ invalid }));
	let active = definition.questions.some(question => question.id === selected)
		? selected
		: definition.questions[0]?.id;

	useLayoutEffect(() => {
		if (!active) return;
		let target = focusRequest?.id === active ? focusRequest.target : undefined;
		let tab = document.getElementById(tabId(active));
		tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
		if (target === "tab") tab?.focus();
		else if (target === "answer") {
			let panel = document.getElementById(panelId());
			let options = panel
				? [
					...panel.querySelectorAll<HTMLInputElement>(
						'input[type="radio"], input[type="checkbox"]',
					),
				].filter(input => !input.disabled)
				: [];
			(options.find(input => input.checked) ?? options[0])?.focus();
		}
		if (target) setFocusRequest(undefined);
	}, [active, focusRequest, id]);

	let questions = definition.questions;
	let index = Math.max(0, questions.findIndex(question => question.id === active));
	let question = questions[index];
	let tabs = questions.length > 1;

	function tabId(question: string) {
		return `question-tab-${id}-${question}`;
	}

	function panelId() {
		return `question-panel-${id}`;
	}

	function select(next: number, moveFocus?: "tab" | "answer") {
		let question = questions[next];
		if (!question) return;
		blur?.();
		setFocusRequest(moveFocus ? { id: question.id, target: moveFocus } : undefined);
		setActive(question.id);
	}

	function navigate(event: KeyboardEvent<HTMLElement>) {
		if (
			event.defaultPrevented || event.nativeEvent.isComposing || event.altKey
			|| event.ctrlKey
			|| event.metaKey
			|| event.shiftKey
		) {
			return;
		}
		let target = event.target;
		if (!(target instanceof HTMLElement)) return;
		let tab = target.closest('[role="tab"]');
		let choice = target instanceof HTMLInputElement
				&& (target.type === "radio" || target.type === "checkbox")
			? target
			: undefined;
		if (!tab && !choice) return;

		if ((choice || tab) && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
			let panel = choice
				? target.closest('[role="tabpanel"]') ?? target.closest("fieldset")
				: document.getElementById(panelId());
			let options = panel
				? [
					...panel.querySelectorAll<HTMLInputElement>(
						'input[type="radio"], input[type="checkbox"]',
					),
				]
					.filter(input => !input.disabled)
				: [];
			if (options.length === 0) return;
			let current = choice
				? options.indexOf(choice)
				: options.findIndex(input => input.checked);
			let offset = event.key === "ArrowDown" ? 1 : -1;
			let next = current === -1
				? options[event.key === "ArrowDown" ? 0 : options.length - 1]
				: options[(current + offset + options.length) % options.length];
			event.preventDefault();
			event.stopPropagation();
			next.focus();
			if (next.type === "radio") next.click();
			return;
		}

		if (!tabs) return;

		let next: number | undefined;
		if (event.key === "ArrowRight") next = (index + 1) % questions.length;
		else if (event.key === "ArrowLeft") next = (index - 1 + questions.length) % questions.length;
		else if (event.key === "Home" && tab) next = 0;
		else if (event.key === "End" && tab) next = questions.length - 1;
		if (next === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		select(next, choice ? "answer" : "tab");
	}

	let extra = count > 1 ? count - 1 : 0;
	return (
		<section
			aria-label="Ace questionnaire"
			{...props}
			onKeyDownCapture={navigate}
			className={cn(
				"mb-2 rounded-xl squircle border border-border bg-background text-sm text-foreground shadow-composer",
				className,
			)}
		>
			<header className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
				<div className="min-w-0">
					<p className="font-medium">{title}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Requested by {requester}
						{extra > 0 && ` · ${extra} more pending`}
					</p>
				</div>
				{syncing && <span className="shrink-0 text-xs text-muted-foreground">Syncing…</span>}
			</header>

			{tabs && (
				<QuestionTabs
					questions={questions}
					index={index}
					view={view}
					presence={form.presence}
					tabId={tabId}
					panelId={panelId}
					select={select}
				/>
			)}

			<div className="flex max-h-[min(56vh,32rem)] flex-col gap-4 overflow-y-auto px-3 py-3">
				{question && (
					<div
						role={tabs ? "tabpanel" : undefined}
						id={tabs ? panelId() : undefined}
						aria-labelledby={tabs ? tabId(question.id) : undefined}
					>
						<QuestionAnswer form={form} question={question} index={index} item={id} />
					</div>
				)}
			</div>

			<QuestionFooter form={form} index={index} select={select} />
		</section>
	);
}

function QuestionFooter(
	{ form, index, select }: {
		form: QuestionForm;
		index: number;
		select: (index: number) => void;
	},
) {
	let { error, validation, status, retry, submitting, disabled, submit } = form;
	let questions = form.definition.questions;
	let tabs = questions.length > 1;
	let last = index === questions.length - 1;
	return (
		<footer className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
			<p
				role={error || validation ? "alert" : undefined}
				className="min-w-0 text-xs text-muted-foreground"
			>
				{error || validation || status
					|| (tabs ? `Question ${index + 1} of ${questions.length}` : "")}
			</p>
			<div className="flex shrink-0 gap-1.5">
				{form.actions}
				{error && retry && (
					<Button
						size="sm"
						variant="secondary"
						onClick={retry}
					>
						Retry
					</Button>
				)}
				{tabs && index > 0 && (
					<Button
						size="sm"
						variant="secondary"
						disabled={submitting}
						onClick={() => select(index - 1)}
					>
						Previous
					</Button>
				)}
				{tabs && !last
					? (
						<Button
							size="sm"
							disabled={submitting}
							onClick={() => select(index + 1)}
						>
							Next
						</Button>
					)
					: (
						<Button
							size="sm"
							disabled={disabled}
							onClick={() => void submit()}
						>
							{submitting ? "Submitting…" : "Submit answers"}
						</Button>
					)}
			</div>
		</footer>
	);
}

function QuestionAnswer(
	{ form, question, index, item }: {
		form: QuestionForm;
		question: QuestionItem;
		index: number;
		item: string;
	},
) {
	let { disabled, view, focus, blur, choose } = form;
	let answer = view?.[question.id];
	let presence = form.presence?.(question.id);
	return (
		<fieldset disabled={disabled} className="min-w-0">
			<legend className="min-w-0 font-medium">
				<span className="mr-1.5 text-xs text-muted-foreground">{index + 1}.</span>
				{question.header}
			</legend>
			{presence && (
				<div className="mt-1 flex justify-end">
					{presence.content}
				</div>
			)}
			<p className="mb-2 text-xs leading-relaxed text-muted-foreground">
				{question.question}
			</p>
			<div className="flex flex-col gap-1.5">
				{question.options.map((option) => {
					let checked = answer?.mode === "choices" && (question.multiple
						? !!answer.options?.[option.id]
						: answer.choice === option.id);
					return (
						<label
							key={option.id}
							onPointerDown={event => event.currentTarget.querySelector("input")?.focus()}
							className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60 has-disabled:cursor-not-allowed"
						>
							<input
								type={question.multiple ? "checkbox" : "radio"}
								name={question.multiple ? undefined : `question-${item}-${question.id}`}
								checked={checked}
								onFocus={() => focus?.(question.id, "choices")}
								onBlur={blur}
								onChange={(event) => {
									event.currentTarget.focus();
									choose(
										question.id,
										option.id,
										question.multiple,
										event.currentTarget.checked,
									);
								}}
								className="mt-1 size-3.5 shrink-0 accent-primary"
							/>
							<span className="min-w-0">
								<span className="block">{option.label}</span>
								{option.description && (
									<span className="block text-xs leading-relaxed text-muted-foreground">
										{option.description}
									</span>
								)}
							</span>
						</label>
					);
				})}
			</div>
			{form.custom?.(question)}
		</fieldset>
	);
}

function QuestionTabs({ questions, index, view, presence, tabId, panelId, select }: {
	questions: QuestionItem[];
	index: number;
	view?: QuestionDraft;
	presence?: QuestionForm["presence"];
	tabId: (id: string) => string;
	panelId: () => string;
	select: (index: number) => void;
}) {
	return (
		<div
			role="tablist"
			aria-label="Questions"
			className="scrollbar-none flex min-w-0 overflow-x-auto border-b border-border bg-muted/30"
		>
			{questions.map((item, tab) => {
				let selected = tab === index;
				let complete = isAnswered(item, view?.[item.id]);
				let present = presence?.(item.id)?.count || 0;
				let editing = present
					? `, ${present} ${present === 1 ? "collaborator" : "collaborators"} editing`
					: "";
				return (
					<button
						key={item.id}
						type="button"
						role="tab"
						id={tabId(item.id)}
						aria-controls={panelId()}
						aria-selected={selected}
						aria-label={`${tab + 1}. ${item.header}${complete ? ", answered" : ""}${editing}`}
						tabIndex={selected ? 0 : -1}
						data-active={selected || undefined}
						onClick={() => select(tab)}
						className="group flex h-9 min-w-28 max-w-44 shrink-0 items-center gap-1.5 border-r border-border px-2.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[active]:bg-background data-[active]:text-foreground"
					>
						<span
							data-complete={complete || undefined}
							className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[0.625rem] font-medium group-data-[active]:border-foreground/30 data-[complete]:border-primary data-[complete]:bg-primary data-[complete]:text-primary-foreground"
						>
							{tab + 1}
						</span>
						<span className="min-w-0 flex-1 truncate">{item.header}</span>
						{present > 0 && (
							<span
								aria-hidden="true"
								className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[0.625rem] font-medium text-muted-foreground"
							>
								{present}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
