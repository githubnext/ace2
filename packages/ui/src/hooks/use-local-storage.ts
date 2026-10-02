import { useCallback, useRef, useSyncExternalStore } from "react";

type Listener = () => void;

/** Per-key subscriber sets shared across all hook instances. */
const subs = new Map<string, Set<Listener>>();

function emit(key: string) {
	subs.get(key)?.forEach(l => l());
}

function sub(key: string, listener: Listener) {
	let set = subs.get(key);
	if (!set) subs.set(key, set = new Set());
	set.add(listener);
	return () => {
		set.delete(listener);
		if (!set.size) subs.delete(key);
	};
}

/**
 * React hook for state persisted in localStorage.
 * Syncs across tabs via `storage` events and uses
 * `useSyncExternalStore` for tear-free concurrent reads.
 *
 * @example
 * ```tsx
 * let [width, setWidth] = useLocalStorage("sidebar:width", 300);
 * let [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "dark");
 * ```
 */
export function useLocalStorage<T>(
	key: string,
	fallback: T,
): [T, (value: T | ((prev: T) => T)) => void] {
	let ref = useRef(fallback);

	let subscribe = useCallback((listener: Listener) => {
		let unsub = sub(key, listener);
		let handler = (e: StorageEvent) => {
			if (e.key === key || e.key === null) listener();
		};
		addEventListener("storage", handler);
		return () => {
			unsub();
			removeEventListener("storage", handler);
		};
	}, [key]);

	let snapshot = useCallback((): T => {
		try {
			let raw = localStorage.getItem(key);
			if (raw !== null) return (ref.current = JSON.parse(raw));
		} catch {}
		return (ref.current = fallback);
	}, [key, fallback]);

	let value = useSyncExternalStore(subscribe, snapshot, () => fallback);

	let set = useCallback((next: T | ((prev: T) => T)) => {
		let prev = snapshot();
		let resolved = typeof next === "function"
			? (next as (prev: T) => T)(prev)
			: next;
		try {
			localStorage.setItem(key, JSON.stringify(resolved));
			ref.current = resolved;
		} catch {}
		emit(key);
	}, [key, snapshot]);

	return [value, set];
}
