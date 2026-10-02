import { type RefObject, useEffect, useEffectEvent } from "react";

/** Call `callback` when a pointer interaction lands outside `ref`. */
export function useClickOutside(
	ref: RefObject<HTMLElement | null>,
	active: boolean,
	callback: () => void,
	ignore?: string,
) {
	let run = useEffectEvent(callback);

	useEffect(() => {
		if (!active) return;

		let handler = (event: PointerEvent) => {
			let el = ref.current;
			if (!el) return;

			let path = event.composedPath();
			if (path.includes(el)) return;
			if (ignore && path.some((item) => item instanceof Element && item.matches(ignore))) return;
			run();
		};

		document.addEventListener("pointerdown", handler, true);
		return () => document.removeEventListener("pointerdown", handler, true);
	}, [active, ignore, ref]);
}
