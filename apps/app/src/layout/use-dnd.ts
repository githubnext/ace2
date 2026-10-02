import { type PointerEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import * as Split from "@ace/split-tabs";

export type DndDrop =
	| { kind: "pane"; pane: string; side?: Split.Side; valid: boolean }
	| { kind: "tab"; pane: string; before: string }
	| { kind: "bar"; pane: string };

export type DndDrag = {
	uid: string;
	x: number;
	y: number;
};

type Press = {
	uid: string;
	pane: string;
	pointer: number;
	x: number;
	y: number;
	started: boolean;
};

const DISTANCE = 4;
const SHIFT = 10;
const EDGE = 0.25;
const MIN = 80;

function translate(x: number, y: number) {
	return `translate3d(${x + SHIFT}px, ${y + SHIFT}px, 0)`;
}

function same(a: DndDrop | undefined, b: DndDrop | undefined) {
	if (!a || !b) return a === b;
	if (a.kind !== b.kind || a.pane !== b.pane) return false;
	if (a.kind === "pane" && b.kind === "pane") return a.side === b.side && a.valid === b.valid;
	if (a.kind === "tab" && b.kind === "tab") return a.before === b.before;
	return true;
}

function edge(rect: DOMRect, x: number, y: number): Split.Side | undefined {
	const left = x - rect.left;
	const top = y - rect.top;
	if (left < 0 || left > rect.width || top < 0 || top > rect.height) return undefined;

	const xedge = Math.max(MIN, rect.width * EDGE);
	const yedge = Math.max(MIN, rect.height * EDGE);

	if (left < xedge) return "left";
	if (left > rect.width - xedge) return "right";
	if (top < yedge) return "top";
	if (top > rect.height - yedge) return "bottom";
	return undefined;
}

function closest(list: Element[], selector: string): HTMLElement | undefined {
	for (const element of list) {
		const match = element.closest<HTMLElement>(selector);
		if (match) return match;
	}
}

function home(state: Split.State, item: Press, pane: string) {
	const host = Split.host(state, item.uid);
	return host?.uid === pane ? host : undefined;
}

function still(pane: Split.Pane, uid: string, before?: string) {
	if (before === uid) return true;
	if (before) return pane.tabs[pane.tabs.indexOf(uid) + 1] === before;
	return pane.tabs.at(-1) === uid;
}

export function useDnd(
	api: Split.Api,
	flat: boolean,
	fit: Split.Fit,
) {
	const [drag, setDrag] = useState<DndDrag>();
	const [drop, setDrop] = useState<DndDrop>();
	const press = useRef<Press | undefined>(undefined);
	const preview = useRef<HTMLDivElement>(null);
	const skip = useRef(false);
	const mode = useRef(flat);
	const data = useRef(fit);

	useEffect(() => {
		mode.current = flat;
		data.current = fit;
	}, [flat, fit]);

	function target(x: number, y: number, item: Press | undefined): DndDrop | undefined {
		const state = api.get();
		const stack = document.elementsFromPoint(x, y);
		const tab = closest(stack, "[data-layout-tab]");
		let pane = tab?.dataset.layoutPane;
		const before = tab?.dataset.layoutTab;
		if (pane && before) {
			const own = item ? home(state, item, pane) : undefined;
			if (item && own && still(own, item.uid, before)) return undefined;

			return { kind: "tab", pane, before };
		}

		const bar = closest(stack, "[data-layout-tabs]");
		pane = bar?.dataset.layoutPane;
		if (pane) {
			const own = item ? home(state, item, pane) : undefined;
			if (item && own && still(own, item.uid)) return undefined;

			return { kind: "bar", pane };
		}

		const zone = closest(stack, "[data-layout-zone]");
		pane = zone?.dataset.layoutPane;
		if (!zone || !pane) return undefined;

		const side = item ? edge(zone.getBoundingClientRect(), x, y) : undefined;
		const own = item ? home(state, item, pane) : undefined;
		if (!side || !item) return own ? undefined : { kind: "pane", pane, side, valid: true };
		if (own?.tabs.length === 1) return undefined;

		const move = { tab: item.uid, to: { pane, side } };
		const valid = Split.can(state, { ...data.current, move });
		return { kind: "pane", pane, side, valid };
	}

	function mark(next: DndDrop | undefined) {
		setDrop(prev => same(prev, next) ? prev : next);
	}

	function nudge(x: number, y: number) {
		const node = preview.current;
		if (node) node.style.transform = translate(x, y);
	}

	function previewRef(node: HTMLDivElement | null) {
		preview.current = node;
	}

	function shift(id: number, x: number, y: number) {
		const item = press.current;
		if (!item || item.pointer !== id) return false;

		if (!item.started) {
			const dx = x - item.x;
			const dy = y - item.y;
			if (Math.hypot(dx, dy) < DISTANCE) return false;

			item.started = true;
			window.getSelection()?.removeAllRanges();
			setDrag({ uid: item.uid, x: x + SHIFT, y: y + SHIFT });
		}

		nudge(x, y);
		mark(target(x, y, item));
		return true;
	}

	function abort(id?: number) {
		const item = press.current;
		if (id !== undefined && item?.pointer !== id) return false;

		press.current = undefined;
		skip.current = false;
		setDrag(undefined);
		mark(undefined);
		return !!item;
	}

	function finish(id: number, x: number, y: number) {
		const item = press.current;
		if (!item || item.pointer !== id) return false;

		press.current = undefined;
		if (!item.started) return true;

		// Suppress the synthetic click that fires after pointerup so a drag-release
		// over a tab doesn't also trigger its onClick selection. Clears on the next tick.
		skip.current = true;
		setTimeout(() => {
			skip.current = false;
		});
		const next = target(x, y, item);
		setDrag(undefined);
		mark(undefined);

		if (!next) return true;
		if (next.kind === "pane" && next.side && !next.valid) return true;
		if (next.kind === "tab") {
			api.move({ tab: item.uid, to: { pane: next.pane, before: next.before }, fit: data.current });
		} else if (next.kind === "bar" || !next.side || mode.current) {
			api.move({ tab: item.uid, to: { pane: next.pane }, fit: data.current });
		} else {
			api.move({ tab: item.uid, to: { pane: next.pane, side: next.side }, fit: data.current });
		}
		return true;
	}

	const move = useEffectEvent((event: globalThis.PointerEvent) => {
		if (shift(event.pointerId, event.clientX, event.clientY)) event.preventDefault();
	});
	const up = useEffectEvent((event: globalThis.PointerEvent) => {
		if (finish(event.pointerId, event.clientX, event.clientY)) event.preventDefault();
	});
	const cancel = useEffectEvent(abort);

	useEffect(() => {
		const scope = new AbortController();
		const capture = { capture: true, signal: scope.signal };
		const options = { signal: scope.signal };

		function cancel(event: globalThis.PointerEvent) {
			if (abort(event.pointerId)) event.preventDefault();
		}

		function leave(event: globalThis.PointerEvent) {
			const { clientX, clientY } = event;
			if (clientX <= 0 || clientY <= 0 || clientX >= innerWidth || clientY >= innerHeight) abort();
		}

		function stop() {
			abort();
		}

		function key(event: KeyboardEvent) {
			if (event.key === "Escape" && abort()) event.preventDefault();
		}

		function visible() {
			if (document.visibilityState !== "visible") abort();
		}

		document.addEventListener("pointermove", move, capture);
		document.addEventListener("pointerup", up, capture);
		document.addEventListener("pointercancel", cancel, capture);
		document.documentElement.addEventListener("pointerleave", leave, options);
		document.addEventListener("keydown", key, options);
		document.addEventListener("visibilitychange", visible, options);
		window.addEventListener("blur", stop, options);

		return () => scope.abort();
	}, []);

	useEffect(() => {
		if (flat) cancel();
	}, [flat]);

	function start(event: PointerEvent<HTMLElement>, uid: string, pane: string) {
		if (flat || !event.isPrimary || event.button !== 0) return;

		press.current = {
			uid,
			pane,
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			started: false,
		};
	}

	function consume() {
		if (!skip.current) return false;
		skip.current = false;
		return true;
	}

	return {
		drag,
		drop,
		consume,
		preview: previewRef,
		start,
	};
}
