import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query and return whether it matches.
 * Updates synchronously when the match state changes.
 *
 * @example
 * let desktop = useMedia(media.md);
 */
export function useMedia(query: string): boolean {
	return useSyncExternalStore(
		(cb) => {
			let mql = window.matchMedia(query);
			mql.addEventListener("change", cb);
			return () => mql.removeEventListener("change", cb);
		},
		() => window.matchMedia(query).matches,
		() => false,
	);
}
