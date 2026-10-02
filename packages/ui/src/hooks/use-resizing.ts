import { useEffect, useEffectEvent } from "react";

/**
 * Calls `callback` with `true` when the window starts resizing,
 * and `false` after two animation frames of inactivity.
 */
export function useResizing(callback: (resizing: boolean) => void) {
	let notify = useEffectEvent(callback);
	useEffect(() => {
		let id = 0;
		let handler = () => {
			notify(true);
			cancelAnimationFrame(id);
			id = requestAnimationFrame(() => {
				id = requestAnimationFrame(() => notify(false));
			});
		};
		window.addEventListener("resize", handler);
		return () => {
			window.removeEventListener("resize", handler);
			cancelAnimationFrame(id);
		};
	}, []);
}
