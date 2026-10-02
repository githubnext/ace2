import { useEffect, useMemo, useRef } from "react";
import type { EditorView } from "prosemirror-view";

function write(key: string, view: EditorView) {
	if (!view.state.doc.textContent) sessionStorage.removeItem(key);
	else sessionStorage.setItem(key, JSON.stringify(view.state.doc.toJSON()));
}

/**
 * Persist composer input to sessionStorage, scoped by key (defaults to pathname).
 * Debounced at 500ms. Call `clear` on send.
 */
function useDraft(scope?: string) {
	let k = `ace:draft:${scope || location.pathname}`;
	let timer = useRef(0);
	let view = useRef<EditorView | null>(null);
	let initial = useMemo<Record<string, unknown> | undefined>(() => {
		try {
			let raw = sessionStorage.getItem(k);
			return raw ? JSON.parse(raw) : undefined;
		} catch {
			return undefined;
		}
	}, [k]);

	/** Debounced save. Removes key when empty. */
	function save(next: EditorView) {
		view.current = next;
		clearTimeout(timer.current);
		timer.current = window.setTimeout(() => {
			write(k, next);
		}, 500);
	}

	/** Clear draft immediately. */
	function clear() {
		view.current = null;
		clearTimeout(timer.current);
		sessionStorage.removeItem(k);
	}

	useEffect(() => () => {
		clearTimeout(timer.current);
		if (view.current) write(k, view.current);
	}, [k]);

	return { defaultValue: initial, save, clear };
}

export { useDraft };
