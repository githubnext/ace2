import { useEffect, useEffectEvent } from "react";

/**
 * Register a global keyboard shortcut.
 * Skips when focus is in an input, textarea, or contenteditable element.
 *
 * @example
 * useHotkey("1", () => setActive("home"));
 * useHotkey("k", () => openSearch(), { meta: true });
 */
export function useHotkey(
	key: string,
	callback: () => void,
	options?: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean },
) {
	let run = useEffectEvent(callback);

	useEffect(() => {
		let target = key.toLowerCase();
		let handler = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== target) return;
			if (!!options?.meta !== e.metaKey) return;
			if (!!options?.ctrl !== e.ctrlKey) return;
			if (!!options?.shift !== e.shiftKey) return;
			if (!!options?.alt !== e.altKey) return;
			let el = e.target as HTMLElement;
			if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
			e.preventDefault();
			run();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [key, options?.meta, options?.ctrl, options?.shift, options?.alt]);
}
