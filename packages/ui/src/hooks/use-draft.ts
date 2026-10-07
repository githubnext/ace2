import { useMemo } from "react";
import type { EditorView } from "prosemirror-view";

/** Storage can be full or unavailable; a failed write must never break editor input. */
function attempt(fn: () => void): boolean {
	try {
		fn();
		return true;
	} catch {
		return false;
	}
}

function get(store: "localStorage" | "sessionStorage", key: string): string | null {
	try {
		return window[store].getItem(key);
	} catch {
		return null;
	}
}

function remove(key: string) {
	attempt(() => localStorage.removeItem(key));
	attempt(() => sessionStorage.removeItem(key));
}

/**
 * Read a saved draft. Earlier versions kept drafts in sessionStorage. A durable draft wins;
 * otherwise a live legacy draft moves to localStorage. The legacy copy is dropped only once a
 * durable one exists, so a failed write keeps it and a later clear cannot resurrect it.
 */
function read(key: string): Record<string, unknown> | undefined {
	let raw = get("localStorage", key);
	const legacy = get("sessionStorage", key);
	if (legacy !== null) {
		let durable = raw !== null || attempt(() => localStorage.setItem(key, legacy));
		if (durable) attempt(() => sessionStorage.removeItem(key));
		raw ||= legacy;
	}
	try {
		return raw ? JSON.parse(raw) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Persist composer input to localStorage, scoped by key (defaults to pathname), so drafts
 * survive a browser or app restart. Every edit is written synchronously: a quit can follow the
 * last keystroke immediately, and neither timers nor unmount run then. Call `clear` on send.
 */
function useDraft(scope?: string) {
	let k = `ace:draft:${scope || location.pathname}`;
	let initial = useMemo(() => read(k), [k]);

	/** Save the document. Removes the key when empty. */
	function save(view: EditorView) {
		if (!view.state.doc.textContent) return remove(k);
		attempt(() => localStorage.setItem(k, JSON.stringify(view.state.doc.toJSON())));
	}

	/** Clear draft immediately. */
	function clear() {
		remove(k);
	}

	return { defaultValue: initial, save, clear };
}

export { useDraft };
