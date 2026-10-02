import { type RefObject, useEffect } from "react";
import { media } from "../lib/screens";

const CLS = "utils:no-motion";
const QUERIES = [media.sm, media.md, media.lg, media.xl];

/**
 * Suppresses CSS transitions on an element during initial mount,
 * window resize, and media query breakpoint crossings.
 *
 * @example
 * useSuppressMotion(ref);
 */
export function useSuppressMotion(ref: RefObject<HTMLElement | null>) {
	useEffect(() => {
		let el = ref.current;
		if (!el) return;

		let frame = 0;
		let suppress = () => {
			el.classList.add(CLS);
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = requestAnimationFrame(() => el.classList.remove(CLS));
			});
		};

		suppress();

		window.addEventListener("resize", suppress);
		let mqls = QUERIES.map(q => window.matchMedia(q));
		mqls.forEach(mql => mql.addEventListener("change", suppress));

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("resize", suppress);
			mqls.forEach(mql => mql.removeEventListener("change", suppress));
		};
	}, [ref]);
}
