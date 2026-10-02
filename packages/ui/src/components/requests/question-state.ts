import type { QuestionDraft, QuestionItem } from "./question";

/** Determine whether a controlled answer contains a selected choice or nonblank custom text. */
export function isAnswered(
	question: QuestionItem,
	draft: QuestionDraft[string] | undefined,
): boolean {
	if (!draft) return false;
	if (draft.mode === "custom") return !!draft.custom.trim();
	if (question.multiple) return question.options.some(option => draft.options[option.id]);
	return question.options.some(option => option.id === draft.choice);
}
