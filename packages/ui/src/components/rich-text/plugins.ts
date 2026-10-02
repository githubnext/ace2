import { type EditorState, Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { SearchIndex } from "emoji-mart";

import { type DocumentCandidate, isPlan, resolveDocument } from "./references";
import { schema } from "./schema";

/** Shared state shape for mention and slash suggestion plugins. */
type SuggestState = {
	active: boolean;
	range: { from: number; to: number } | null;
	query: string;
};

const INACTIVE: SuggestState = { active: false, range: null, query: "" };

const suggestKey = new PluginKey<SuggestState>("mention-suggest");
const documentKey = new PluginKey<SuggestState>("document-suggest");
const slashKey = new PluginKey<SuggestState>("slash-command");
const emojiKey = new PluginKey<SuggestState>("emoji-suggest");

function createSuggestPlugin(
	key: PluginKey<SuggestState>,
	find: (state: EditorState) => SuggestState,
	onUpdate: (state: SuggestState) => void,
	opts?: {
		decoration?: string;
		input?: (
			view: EditorView,
			from: number,
			to: number,
			text: string,
			state: SuggestState,
		) => boolean;
	},
) {
	return new Plugin<SuggestState>({
		key,
		state: {
			init: () => INACTIVE,
			apply(tr, prev, _old, state) {
				if (!prev.active && !tr.docChanged) return INACTIVE;
				return find(state);
			},
		},
		props: {
			handleTextInput(view, from, to, text) {
				let state = key.getState(view.state);
				return state ? opts?.input?.(view, from, to, text, state) || false : false;
			},
			decorations(state) {
				if (!opts?.decoration) return DecorationSet.empty;
				let s = key.getState(state);
				if (!s?.active || !s.range) return DecorationSet.empty;
				return DecorationSet.create(state.doc, [
					Decoration.inline(s.range.from, s.range.to, { class: opts.decoration }),
				]);
			},
		},
		view: () => ({
			update(view) {
				onUpdate(key.getState(view.state) || INACTIVE);
			},
		}),
	});
}

function findMention(state: EditorState) {
	let sel = state.selection;
	if (!sel.empty) return INACTIVE;

	let $pos = sel.$from;
	let text = $pos.parent.textBetween(0, $pos.parentOffset, "", "\uFFFC");
	let match = /(^|[\s([{\uFFFC])@([\w.-]*)$/.exec(text);
	if (!match) return INACTIVE;

	let query = match[2]!;
	let from = $pos.start() + $pos.parentOffset - match[0]!.length + match[1]!.length;
	let to = $pos.start() + $pos.parentOffset;
	return { active: true, range: { from, to }, query };
}

function findDocument(state: EditorState) {
	let sel = state.selection;
	if (!sel.empty) return INACTIVE;

	let $pos = sel.$from;
	if ($pos.parent.type === schema.nodes.code_block) return INACTIVE;
	let marks = state.storedMarks || $pos.marks();
	if (schema.marks.code.isInSet(marks) || schema.marks.link.isInSet(marks)) return INACTIVE;

	let text = $pos.parent.textBetween(0, $pos.parentOffset, "", "\uFFFC");
	let match = /(^|[\s([{\uFFFC])&([a-z0-9.-]*)$/i.exec(text);
	if (!match) return INACTIVE;

	let query = match[2]!;
	let from = $pos.start() + $pos.parentOffset - match[0]!.length + match[1]!.length;
	let to = $pos.start() + $pos.parentOffset;
	return { active: true, range: { from, to }, query };
}

function findSlash(state: EditorState) {
	let sel = state.selection;
	if (!sel.empty) return INACTIVE;

	let $pos = sel.$from;
	if ($pos.parent.type !== schema.nodes.paragraph) return INACTIVE;
	if ($pos.depth !== 1 || $pos.index(0) !== 0) return INACTIVE;
	if ((state.storedMarks || $pos.marks()).length > 0) return INACTIVE;

	let text = $pos.parent.textBetween(0, $pos.parentOffset, "", "\uFFFC");
	let match = /^\/([\w-]*)$/.exec(text);
	if (!match) {
		let first = $pos.parent.firstChild;
		if (first?.type !== schema.nodes.mention || first.attrs.name.toLowerCase() !== "ace") {
			return INACTIVE;
		}
		match = /^\uFFFC\s*\/([\w-]*)$/.exec(text);
	}
	if (!match) return INACTIVE;

	let query = match[1]!;
	let from = $pos.start() + text.lastIndexOf("/");
	let to = $pos.start() + $pos.parentOffset;
	return { active: true, range: { from, to }, query };
}

/** Inserts a mention node, replacing the active suggestion range. */
function insertMention(view: EditorView, name: string, id?: string, avatar?: string) {
	let state = suggestKey.getState(view.state);
	let { tr } = view.state;
	let node = schema.nodes.mention.create({ name, id: id || null, avatar: avatar || null });

	if (state?.range) {
		tr = tr.delete(state.range.from, state.range.to).insert(state.range.from, [
			node,
			schema.text(" "),
		]);
	} else {
		tr = tr.replaceSelectionWith(node).insertText(" ");
	}

	view.dispatch(tr);
	view.focus();
}

/** Inserts an atomic document reference, replacing the active suggestion range. */
function insertDocument(view: EditorView, document: DocumentCandidate) {
	let state = documentKey.getState(view.state);
	let { tr } = view.state;
	let node = schema.nodes.document.create({ uid: document.uid, name: document.name });

	if (state?.range) {
		tr = tr.delete(state.range.from, state.range.to).insert(state.range.from, [
			node,
			schema.text(" "),
		]);
	} else {
		tr = tr.replaceSelectionWith(node).insertText(" ");
	}

	view.dispatch(tr);
	view.focus();
}

/** Inserts an atomic Plan reference, replacing the active suggestion range. */
function insertPlan(view: EditorView) {
	let state = documentKey.getState(view.state);
	let { tr } = view.state;
	let node = schema.nodes.plan.create();

	if (state?.range) {
		tr = tr.delete(state.range.from, state.range.to).insert(state.range.from, [
			node,
			schema.text(" "),
		]);
	} else {
		tr = tr.replaceSelectionWith(node).insertText(" ");
	}

	view.dispatch(tr);
	view.focus();
}

/**
 * Tracks `@query` text behind the cursor and auto-converts on space.
 */
type Mention = { name: string; avatar?: string; id?: string };

function suggestPlugin(
	onUpdate: (state: SuggestState) => void,
	source: { current: Mention[] | undefined },
	onMention?: (name: string) => void,
) {
	return createSuggestPlugin(suggestKey, findMention, onUpdate, {
		decoration: "mention-suggest",
		input: (view, from, _to, text, state) => {
			if (text !== " ") return false;
			if (!state.active || !state.range || !state.query) return false;

			let mentions = source.current;
			let match = mentions?.find(m => m.name.toLowerCase() === state.query.toLowerCase());
			if (mentions && !match) return false;

			let node = schema.nodes.mention.create({
				name: state.query,
				id: match?.id || null,
				avatar: match?.avatar || null,
			});
			let tr = view.state.tr
				.delete(state.range.from, from)
				.insert(state.range.from, [node, schema.text(" ")]);

			view.dispatch(tr);
			onMention?.(state.query);
			return true;
		},
	});
}

/** Tracks `&query` text behind the cursor and auto-converts resolved names on space. */
function documentPlugin(
	onUpdate: (state: SuggestState) => void,
	documents: { current: readonly DocumentCandidate[] | undefined },
	plan: { current: boolean },
) {
	return createSuggestPlugin(documentKey, findDocument, onUpdate, {
		decoration: "document-suggest",
		input: (view, from, _to, text, state) => {
			if (text !== " ") return false;
			if (!state.active || !state.range || !state.query) return false;

			let document = resolveDocument(documents.current, state.query);
			let node = plan.current && isPlan(state.query)
				? schema.nodes.plan.create()
				: document
				? schema.nodes.document.create({ uid: document.uid, name: document.name })
				: undefined;
			if (!node) return false;
			let tr = view.state.tr
				.delete(state.range.from, from)
				.insert(state.range.from, [node, schema.text(" ")]);

			view.dispatch(tr);
			return true;
		},
	});
}

/** Tracks `/query` at the start of a paragraph. */
function slashPlugin(onUpdate: (state: SuggestState) => void) {
	return createSuggestPlugin(slashKey, findSlash, onUpdate);
}

function findEmoji(state: EditorState) {
	let sel = state.selection;
	if (!sel.empty) return INACTIVE;

	let $pos = sel.$from;
	if ($pos.parent.type === schema.nodes.code_block) return INACTIVE;

	let text = $pos.parent.textBetween(0, $pos.parentOffset, "", "\uFFFC");
	let match = /:([\w+-]+)$/.exec(text);
	if (!match) return INACTIVE;

	let query = match[1]!;
	let from = $pos.start() + $pos.parentOffset - match[0]!.length;
	let to = $pos.start() + $pos.parentOffset;
	return { active: true, range: { from, to }, query };
}

type EmojiHit = {
	id: string;
	name: string;
	skins: { native?: string; src?: string }[];
};

/**
 * Tracks `:query` for emoji autocomplete, and auto-converts completed `:name:`
 * shortcodes typed without accepting the popup (covers native shortcodes like
 * `:t-rex:` and custom team emojis like `:Ace:`). Lookup is case-insensitive.
 */
function emojiPlugin(onUpdate: (state: SuggestState) => void) {
	return createSuggestPlugin(emojiKey, findEmoji, onUpdate, {
		input: (view, _from, _to, text, state) => {
			if (text !== ":" || !state.active || !state.range || !state.query) return false;

			let query = state.query;
			let from = state.range.from;

			(async () => {
				let results = await SearchIndex.search(query, { maxResults: 8, caller: null });
				if (!results?.length) return;

				let q = query.toLowerCase();
				let match = (results as EmojiHit[]).find(
					e => e.id.toLowerCase() === q || e.name.toLowerCase() === q,
				);
				if (!match) return;

				let doc = view.state.doc;
				let to = from + query.length + 2;
				if (to > doc.content.size) return;
				if (doc.textBetween(from, to, "", "\uFFFC") !== `:${query}:`) return;

				let skin = match.skins[0]!;
				let node = skin.native
					? schema.text(skin.native)
					: skin.src
					? schema.nodes.emoji.create({ id: match.id, name: match.name, src: skin.src })
					: null;
				if (!node) return;

				view.dispatch(view.state.tr.replaceWith(from, to, node));
			})();

			return false;
		},
	});
}

/** Inserts a native emoji, replacing the active emoji suggestion range. */
function insertEmoji(view: EditorView, native: string) {
	let state = emojiKey.getState(view.state);
	if (!state?.range) return;
	let { tr } = view.state;
	tr = tr.replaceWith(state.range.from, state.range.to, schema.text(native));
	view.dispatch(tr);
	view.focus();
}

/** Inserts a custom emoji image node, replacing the active emoji suggestion range. */
function insertCustomEmoji(view: EditorView, id: string, name: string, src: string) {
	let state = emojiKey.getState(view.state);
	let { tr } = view.state;
	let node = schema.nodes.emoji.create({ id, name, src });

	if (state?.range) {
		tr = tr.delete(state.range.from, state.range.to).insert(state.range.from, [
			node,
			schema.text(" "),
		]);
	} else {
		tr = tr.replaceSelectionWith(node).insertText(" ");
	}

	view.dispatch(tr);
	view.focus();
}

/** Shows placeholder text when the editor is empty. */
function placeholderPlugin(ref: { current: string }) {
	return new Plugin({
		props: {
			decorations(state) {
				if (!ref.current) return DecorationSet.empty;
				let doc = state.doc;
				if (
					doc.childCount !== 1 || !doc.firstChild!.isTextblock || doc.firstChild!.content.size > 0
				) return DecorationSet.empty;
				return DecorationSet.create(doc, [
					Decoration.node(0, doc.firstChild!.nodeSize, {
						class: "is-empty",
						"data-placeholder": ref.current,
					}),
				]);
			},
		},
	});
}

export {
	documentPlugin,
	emojiPlugin,
	insertCustomEmoji,
	insertDocument,
	insertEmoji,
	insertMention,
	insertPlan,
	type Mention,
	placeholderPlugin,
	slashPlugin,
	suggestPlugin,
	type SuggestState,
};
