export type Side = "left" | "right" | "top" | "bottom";
export type Axis = "row" | "col";

type Idx = 0 | 1;
type Span = [string, string];

export type Line = {
	uid: string;
	ratio: number;
};

export type Tab = string;

export type Pane = {
	uid: string;
	area: [Span, Span];
	tabs: string[];
	active?: string;
};

export type State = {
	rows: Line[];
	cols: Line[];
	panes: Pane[];
	tabs: Tab[];
	focus: string;
	seq: number;
	rowsSeq: number;
	colsSeq: number;
	panesSeq: number;
};

export type Data = {
	version: 1;
	state: State;
};

export type Min =
	| number
	| ((tab: Tab | undefined, pane: Pane) => number);

export type Config = {
	min?: Min;
};

export type Handle = {
	uid: string;
	axis: Axis;
	line: string;
	ratio: number;
	start: string;
	end: string;
};

export type Bounds = {
	min: number;
	max: number;
};

type Edge = {
	from: number;
	to: number;
	gap: number;
};

export type Fit = {
	width: number;
	height: number;
	min?: Min;
};

export type View = Fit & {
	flat?: boolean;
};

export type Target =
	| { pane?: string; side?: never; before?: never }
	| { pane?: string; side: Side; before?: never }
	| { pane?: string; side?: never; before: string };

export type Open = {
	tab?: Tab;
	to?: Target;
	fit?: Fit;
};

export type Move = {
	tab: string;
	to?: Target;
	fit?: Fit;
};

export type Check =
	& Fit
	& (
		| { move: Move; open?: never }
		| { open: Open; move?: never }
	);

export type Select = {
	tab: string;
	pane?: string;
};

export type Focus = {
	pane: string;
};

export type Close = {
	tab: string;
};

export type Resize = {
	axis: Axis;
	line: string;
	ratio: number;
	size: number;
	min?: Min;
};

const ROW: Idx = 0;
const COL: Idx = 1;
const PANE = "pane-1";
const EPS = 0.000001;
const VERSION = 1;

type Listener = () => void;

function copy(span: Span): Span {
	return [span[0], span[1]];
}

function orient(side: Side): Idx {
	return side === "left" || side === "right" ? COL : ROW;
}

function after(side: Side) {
	return side === "right" || side === "bottom";
}

function axis(value: Axis): Idx {
	return value === "row" ? ROW : COL;
}

function lines(state: State, axis: Idx) {
	return axis === ROW ? state.rows : state.cols;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function minimum(pane: Pane, min: Min | undefined) {
	if (min === undefined) return 0;
	if (typeof min === "number") return Math.max(0, min);

	let value = 0;
	if (pane.tabs.length === 0) value = min(undefined, pane);
	else {
		for (let uid of pane.tabs) value = Math.max(value, min(uid, pane));
	}

	return Math.max(0, value);
}

function template(lines: Line[], start: string, end: string) {
	let list = lines.toSorted((a, b) => a.ratio - b.ratio);
	let parts = [`[${start}]`];
	let prev = 0;

	for (let line of list) {
		parts.push(`${line.ratio - prev}fr`, `[${line.uid}]`);
		prev = line.ratio;
	}

	parts.push(`${1 - prev}fr`, `[${end}]`);
	return parts.join(" ");
}

function ratio(state: State, axis: Idx, uid: string) {
	if (uid === "RS" || uid === "CS") return 0;
	if (uid === "RE" || uid === "CE") return 1;

	return lines(state, axis).find(line => line.uid === uid)?.ratio ?? 0;
}

function covers(state: State, axis: Idx, span: Span, panes: Pane[]) {
	let start = ratio(state, axis, span[0]);
	let end = ratio(state, axis, span[1]);
	let cursor = start;
	let parts = panes
		.map(pane => pane.area[axis])
		.toSorted((a, b) => ratio(state, axis, a[0]) - ratio(state, axis, b[0]));

	for (let part of parts) {
		let a = ratio(state, axis, part[0]);
		let b = ratio(state, axis, part[1]);
		if (a !== cursor || b <= a) return false;
		cursor = b;
	}

	return cursor === end;
}

function unhost(state: State, uid: string) {
	return state.panes.map(pane => {
		let i = pane.tabs.indexOf(uid);
		if (i === -1) return pane;

		let tabs = pane.tabs.toSpliced(i, 1);
		let active = pane.active === uid ? tabs[0] : pane.active;
		return { ...pane, tabs, active };
	});
}

/** Returns the focused pane, or the first pane if focus is stale. */
export function focused(state: State): Pane {
	return state.panes.find(pane => pane.uid === state.focus) ?? state.panes[0];
}

/** Returns the pane hosting the given tab, or undefined if no pane has it. */
export function host(state: State, uid: string): Pane | undefined {
	return state.panes.find(pane => pane.tabs.includes(uid));
}

/** Returns tab uids in visual order: top-to-bottom, left-to-right across panes, then tab order within each pane. */
export function order(state: State): string[] {
	let seen = new Set<string>();
	let tabs = new Set(state.tabs);
	let list: string[] = [];
	let panes = state.panes.toSorted((a, b) => {
		let ar = range(state, ROW, a.area[ROW]);
		let br = range(state, ROW, b.area[ROW]);
		if (ar.start !== br.start) return ar.start - br.start;

		let ac = range(state, COL, a.area[COL]);
		let bc = range(state, COL, b.area[COL]);
		return ac.start - bc.start;
	});

	for (let pane of panes) {
		for (let uid of pane.tabs) {
			if (seen.has(uid) || !tabs.has(uid)) continue;
			seen.add(uid);
			list.push(uid);
		}
	}

	return list;
}

function range(state: State, axis: Idx, span: Span) {
	return {
		start: ratio(state, axis, span[0]),
		end: ratio(state, axis, span[1]),
	};
}

function overlap(state: State, axis: Idx, a: Span, b: Span) {
	let x = range(state, axis, a);
	let y = range(state, axis, b);
	let start = Math.max(x.start, y.start);
	let end = Math.min(x.end, y.end);

	return start < end ? { start, end } : undefined;
}

function equal(state: State, axis: Idx, a: string, b: string) {
	return Math.abs(ratio(state, axis, a) - ratio(state, axis, b)) < EPS;
}

function group(panes: Pane[], axis: Idx, edge: Idx) {
	let map = new Map<string, Pane[]>();

	for (let pane of panes) {
		let uid = pane.area[axis][edge];
		let list = map.get(uid);
		if (list) list.push(pane);
		else map.set(uid, [pane]);
	}

	return map;
}

function slices(state: State, axis: Idx) {
	let values = [0, 1];
	for (let line of lines(state, axis)) values.push(line.ratio);

	let sorted = [...new Set(values)].toSorted((a, b) => a - b);
	let list: { start: number; end: number }[] = [];
	for (let i = 1; i < sorted.length; i++) list.push({ start: sorted[i - 1], end: sorted[i] });
	return list;
}

function contains(
	state: State,
	pane: Pane,
	axis: Idx,
	start: number,
	end: number,
) {
	let span = range(state, axis, pane.area[axis]);
	return span.start <= start && span.end >= end;
}

function feasible(state: State, axis: Idx, size: number, min: Min | undefined) {
	let other = axis === ROW ? COL : ROW;

	for (let part of slices(state, other)) {
		let total = 0;
		for (let pane of state.panes) {
			if (contains(state, pane, other, part.start, part.end)) {
				total += minimum(pane, min);
			}
		}
		if (total > size) return false;
	}

	return true;
}

function project(
	state: State,
	axis: Idx,
	size: number,
	min: Min | undefined,
): State {
	let list = lines(state, axis);
	if (list.length === 0 || size <= 0) return state;

	let start = axis === ROW ? "RS" : "CS";
	let end = axis === ROW ? "RE" : "CE";
	let points = [
		{ uid: start, ratio: 0 },
		...list.toSorted((a, b) => a.ratio - b.ratio),
		{ uid: end, ratio: 1 },
	];
	let index = new Map(points.map((point, i) => [point.uid, i]));
	let edges: Edge[] = [];
	let incoming = Array.from({ length: points.length }, () => [] as Edge[]);
	let outgoing = Array.from({ length: points.length }, () => [] as Edge[]);

	function add(from: number, to: number, gap: number) {
		let edge = { from, to, gap };
		edges.push(edge);
		incoming[to].push(edge);
		outgoing[from].push(edge);
	}

	for (let i = 1; i < points.length; i++) add(i - 1, i, 0);
	for (let pane of state.panes) {
		let from = index.get(pane.area[axis][0]);
		let to = index.get(pane.area[axis][1]);
		if (from === undefined || to === undefined || from >= to) continue;
		add(from, to, minimum(pane, min) / size);
	}

	let lower = Array(points.length).fill(0) as number[];
	for (let i = 0; i < points.length; i++) {
		if (i > 0) lower[i] = Math.max(lower[i], lower[i - 1]);
		for (let edge of outgoing[i]) lower[edge.to] = Math.max(lower[edge.to], lower[i] + edge.gap);
	}
	if (lower[points.length - 1] > 1 + EPS) return state;

	let upper = Array(points.length).fill(1) as number[];
	for (let i = points.length - 1; i >= 0; i--) {
		if (i < points.length - 1) upper[i] = Math.min(upper[i], upper[i + 1]);
		for (let edge of incoming[i]) {
			upper[edge.from] = Math.min(upper[edge.from], upper[i] - edge.gap);
		}
	}
	if (upper[0] < -EPS) return state;

	let values = Array(points.length).fill(0) as number[];
	values[0] = 0;
	values[points.length - 1] = 1;
	for (let i = 1; i < points.length - 1; i++) {
		let min = lower[i];
		for (let edge of incoming[i]) min = Math.max(min, values[edge.from] + edge.gap);
		values[i] = clamp(points[i].ratio, min, upper[i]);
	}

	let next = list.map(line => {
		let value = values[index.get(line.uid) ?? 0];
		return Math.abs(value - line.ratio) > EPS ? { ...line, ratio: value } : line;
	});
	if (next.every((line, i) => line === list[i])) return state;
	return axis === ROW ? { ...state, rows: next } : { ...state, cols: next };
}

export function constrain(state: State, data: Fit): State {
	if (state.panes.length <= 1 || data.width <= 0 || data.height <= 0) return state;
	let next = project(state, COL, data.width, data.min);
	return project(next, ROW, data.height, data.min);
}

/**
 * Creates state seeded with one pane containing one tab.
 * Invariant: at least one tab must be present at all times. `close` preserves
 * that invariant by no-oping when asked to remove the final tab.
 */
export function initial(tab: Tab): State {
	return {
		rows: [],
		cols: [],
		panes: [{
			uid: PANE,
			area: [["RS", "RE"], ["CS", "CE"]],
			tabs: [tab],
			active: tab,
		}],
		tabs: [tab],
		focus: PANE,
		seq: 1,
		rowsSeq: 0,
		colsSeq: 0,
		panesSeq: 1,
	};
}

export function save(state: State): Data {
	return { version: VERSION, state };
}

export function restore(data: Data | State): State {
	return "state" in data ? data.state : data;
}

export function style(state: State) {
	return {
		gridTemplateColumns: template(state.cols, "CS", "CE"),
		gridTemplateRows: template(state.rows, "RS", "RE"),
	};
}

export function place(item: Pane | Handle): string {
	if ("area" in item) {
		let [row, col] = item.area;
		return `${row[0]} / ${col[0]} / ${row[1]} / ${col[1]}`;
	}
	return item.axis === "col"
		? `${item.start} / ${item.line} / ${item.end} / ${item.line}`
		: `${item.line} / ${item.start} / ${item.line} / ${item.end}`;
}

type Raw = {
	uid: string;
	axis: Axis;
	line: string;
	ratio: number;
	start: number;
	end: number;
};

function nameAt(lines: Line[], r: number, start: string, end: string): string {
	if (r < EPS) return start;
	if (r > 1 - EPS) return end;
	return lines.find(line => Math.abs(line.ratio - r) < EPS)?.uid ?? start;
}

export function handles(state: State): Handle[] {
	let map = new Map<string, Raw[]>();

	for (let item of [ROW, COL] as const) {
		let other = item === ROW ? COL : ROW;
		let label: Axis = item === ROW ? "row" : "col";
		let starts = group(state.panes, item, 0);
		let ends = group(state.panes, item, 1);

		for (let line of lines(state, item)) {
			for (let a of ends.get(line.uid) ?? []) {
				for (let b of starts.get(line.uid) ?? []) {
					let part = overlap(state, other, a.area[other], b.area[other]);
					if (!part) continue;

					let uid = `${label}:${line.uid}`;
					let list = map.get(uid);
					let handle: Raw = { uid, axis: label, line: line.uid, ratio: line.ratio, ...part };
					if (list) list.push(handle);
					else map.set(uid, [handle]);
				}
			}
		}
	}

	let list: Raw[] = [];
	for (let [uid, parts] of map) {
		let items = parts.toSorted((a, b) => a.start - b.start || a.end - b.end);
		for (let item of items) {
			let last = list[list.length - 1];
			if (last?.uid === uid && item.start <= last.end + EPS) {
				last.end = Math.max(last.end, item.end);
				continue;
			}

			list.push({ ...item });
		}
	}

	return list.map(item => {
		let other = item.axis === "col" ? state.rows : state.cols;
		let startName = item.axis === "col" ? "RS" : "CS";
		let endName = item.axis === "col" ? "RE" : "CE";
		let start = nameAt(other, item.start, startName, endName);
		let end = nameAt(other, item.end, startName, endName);
		return {
			uid: `${item.uid}:${start}:${end}`,
			axis: item.axis,
			line: item.line,
			ratio: item.ratio,
			start,
			end,
		};
	});
}

export function fits(state: State, data: Fit): boolean {
	if (state.panes.length <= 1 || data.width <= 0 || data.height <= 0) return true;
	return feasible(state, COL, data.width, data.min) && feasible(state, ROW, data.height, data.min);
}

export function collapse(state: State): State {
	if (state.panes.length === 1 && state.rows.length === 0 && state.cols.length === 0) return state;

	let tabs = order(state);
	let active = focused(state)?.active;
	if (!active || !tabs.includes(active)) active = tabs[0];

	return {
		...state,
		rows: [],
		cols: [],
		panes: [{
			uid: PANE,
			area: [["RS", "RE"], ["CS", "CE"]],
			tabs,
			active,
		}],
		focus: PANE,
	};
}

export function view(state: State, data: View): State {
	return data.flat || !fits(state, data) ? collapse(state) : constrain(state, data);
}

export function can(state: State, data: Check): boolean {
	if (data.width <= 0 || data.height <= 0) return false;

	let next = data.move ? move(state, data.move) : open(state, data.open);
	return next !== state && fits(next, data);
}

// Bounds are derived from PANE MEMBERSHIP, not from ratio-order neighbors.
// Two lines on the same axis that don't share a pane are geometrically
// independent (e.g. a row-1 column divider and a row-2 column divider) and
// MUST be allowed to cross in ratio order — the CSS template sorts by ratio
// and panes reference lines by name, so a "crossed" layout is still valid.
// Do not add a `sorted[at-1].ratio` / `sorted[at+1].ratio` initial clamp here:
// it breaks cross-axis independence and prevents legitimate asymmetric splits.
export function bounds(state: State, data: Resize): Bounds | undefined {
	let item = axis(data.axis);
	let list = lines(state, item);
	if (data.size <= 0 || !list.some(line => line.uid === data.line)) return undefined;

	let min = 0;
	let max = 1;
	let value = ratio(state, item, data.line);
	let other = item === ROW ? COL : ROW;
	let locked = false;

	for (let pane of state.panes) {
		let gap = minimum(pane, data.min) / data.size;
		let span = pane.area[item];

		if (span[1] === data.line) min = Math.max(min, ratio(state, item, span[0]) + gap);
		if (span[0] === data.line) max = Math.min(max, ratio(state, item, span[1]) - gap);
	}

	for (let pane of state.panes) {
		let span = pane.area[item];
		if (span[0] !== data.line && span[1] !== data.line) continue;

		for (let next of state.panes) {
			if (pane.uid === next.uid || !overlap(state, other, pane.area[other], next.area[other])) {
				continue;
			}

			let area = next.area[item];
			if (span[0] === data.line && area[1] !== data.line) {
				let end = ratio(state, item, area[1]);
				if (ratio(state, item, area[0]) < value + EPS && Math.abs(end - value) < EPS) {
					locked = true;
				}
			}
			if (span[1] === data.line && area[0] !== data.line) {
				let start = ratio(state, item, area[0]);
				if (ratio(state, item, area[1]) > value - EPS && Math.abs(start - value) < EPS) {
					locked = true;
				}
			}
		}
	}

	if (locked) return { min: value, max: value };
	if (min > max) min = max = (min + max) / 2;
	return { min, max };
}

export function resize(state: State, data: Resize): State {
	let item = axis(data.axis);
	let list = lines(state, item);
	let index = list.findIndex(line => line.uid === data.line);
	if (index === -1) return state;

	let line = list[index];
	let limit = bounds(state, data);
	if (!limit) return state;

	let value = clamp(data.ratio, limit.min, limit.max);
	if (value === line.ratio) return state;

	let next = list.slice();
	next[index] = { uid: line.uid, ratio: value };
	return item === ROW ? { ...state, rows: next } : { ...state, cols: next };
}

function compact(state: State): State {
	let panes = state.panes;
	let focus = state.focus;
	let changed = false;

	while (true) {
		let empty = panes.find(pane => pane.tabs.length === 0);
		if (!empty) break;

		let done = false;
		for (let axis of [COL, ROW]) {
			let other = axis === ROW ? COL : ROW;
			let span = empty.area[axis];
			let sides = [
				{ line: span[0], edge: 1, grow: 1 },
				{ line: span[1], edge: 0, grow: 0 },
			] as const;

			for (let side of sides) {
				let group = panes.filter(pane =>
					pane.uid !== empty.uid
					&& pane.tabs.length > 0
					&& equal(state, axis, pane.area[axis][side.edge], side.line)
					&& ratio(state, other, pane.area[other][0])
						>= ratio(state, other, empty.area[other][0])
					&& ratio(state, other, pane.area[other][1])
						<= ratio(state, other, empty.area[other][1])
				);

				if (!covers(state, other, empty.area[other], group)) continue;

				let ids = new Set(group.map(pane => pane.uid));
				panes = panes
					.map(pane => {
						if (!ids.has(pane.uid)) return pane;

						let area: [Span, Span] = [copy(pane.area[ROW]), copy(pane.area[COL])];
						area[axis][side.grow] = span[side.grow];
						return { ...pane, area };
					})
					.filter(pane => pane.uid !== empty.uid);
				if (focus === empty.uid) {
					focus = group.find(pane => pane.tabs.length > 0)?.uid
						?? panes.find(pane => pane.tabs.length > 0)?.uid
						?? PANE;
				}
				changed = true;
				done = true;
				break;
			}

			if (done) break;
		}

		if (!done) break;
	}

	let used = new Set<string>();
	for (let pane of panes) {
		for (let axis of [ROW, COL]) {
			used.add(pane.area[axis][0]);
			used.add(pane.area[axis][1]);
		}
	}

	let rows = state.rows.filter(line => used.has(line.uid));
	let cols = state.cols.filter(line => used.has(line.uid));
	if (!panes.some(pane => pane.uid === focus)) {
		focus = panes.find(pane => pane.tabs.length > 0)?.uid ?? panes[0]?.uid ?? PANE;
	}

	return changed || rows.length !== state.rows.length || cols.length !== state.cols.length
		? { ...state, rows, cols, panes, focus }
		: state;
}

function make(state: State, data?: Tab) {
	let seq = state.seq + 1;
	let tab = data ?? `tab-${seq}`;
	return { seq, tab };
}

function pane(state: State, to: Target | undefined) {
	return to?.pane ? state.panes.find(item => item.uid === to.pane) : focused(state);
}

function open(state: State, data: Open = {}): State {
	if (data.tab && state.tabs.includes(data.tab)) return state;
	if (!pane(state, data.to)) return state;

	let { seq, tab } = make(state, data.tab);
	let next = move(
		{ ...state, seq, tabs: [...state.tabs, tab] },
		{ tab, to: data.to },
	);
	return data.fit ? constrain(next, data.fit) : next;
}

function select(state: State, data: Select): State {
	let target = data.pane
		? state.panes.find(item => item.uid === data.pane && item.tabs.includes(data.tab))
		: state.panes.find(item => item.tabs.includes(data.tab));
	if (!target) return state;

	return {
		...state,
		focus: target.uid,
		panes: state.panes.map(item => item.uid === target.uid ? { ...item, active: data.tab } : item),
	};
}

function focus(state: State, data: Focus): State {
	return state.panes.some(pane => pane.uid === data.pane) ? { ...state, focus: data.pane } : state;
}

function close(state: State, data: Close): State {
	if (!state.tabs.includes(data.tab) || state.tabs.length <= 1) return state;
	let tabs = state.tabs.filter(uid => uid !== data.tab);
	let panes = unhost(state, data.tab);
	return compact({ ...state, tabs, panes });
}

function move(state: State, data: Move): State {
	let to = data.to;
	if (data.tab === to?.before) return state;

	let dest = pane(state, to);
	if (!dest || !state.tabs.includes(data.tab)) return state;
	if (to?.side) {
		let next = split(state, dest.uid, to.side, data.tab);
		return data.fit ? constrain(next, data.fit) : next;
	}

	let panes = unhost(state, data.tab);
	for (let i = 0; i < panes.length; i++) {
		let pane = panes[i];
		if (pane.uid !== dest.uid) continue;

		let tabs = pane.tabs;
		let at = to?.before ? tabs.indexOf(to.before) : tabs.length;
		if (at < 0) at = tabs.length;
		tabs = [...tabs.slice(0, at), data.tab, ...tabs.slice(at)];
		panes[i] = { ...pane, tabs, active: data.tab };
		break;
	}

	let next = compact({ ...state, panes, focus: dest.uid });
	return data.fit ? constrain(next, data.fit) : next;
}

function split(
	state: State,
	pane: string,
	side: Side,
	uid: string,
): State {
	let initial = state.panes.find(item => item.uid === pane);
	if (!initial || !state.tabs.includes(uid)) return state;

	let origin = state.panes.find(item => item.tabs.includes(uid));
	if (origin?.uid === initial.uid && origin.tabs.length === 1) return state;

	let base = origin && origin.uid !== initial.uid
		? compact({ ...state, panes: unhost(state, uid) })
		: state;
	let target = base.panes.find(item => item.uid === pane);
	if (!target) return state;

	let axis = orient(side);
	let span = target.area[axis];
	let mid = (ratio(base, axis, span[0]) + ratio(base, axis, span[1])) / 2;
	let line: Line = axis === ROW
		? { uid: `R${base.rowsSeq + 1}`, ratio: mid }
		: { uid: `C${base.colsSeq + 1}`, ratio: mid };
	let next = `pane-${base.panesSeq + 1}`;
	let first: [Span, Span] = [copy(target.area[ROW]), copy(target.area[COL])];
	let area: [Span, Span] = [copy(target.area[ROW]), copy(target.area[COL])];

	if (after(side)) {
		first[axis] = [span[0], line.uid];
		area[axis] = [line.uid, span[1]];
	} else {
		first[axis] = [line.uid, span[1]];
		area[axis] = [span[0], line.uid];
	}

	let panes = origin?.uid === target.uid ? unhost(base, uid) : base.panes.slice();
	for (let i = 0; i < panes.length; i++) {
		if (panes[i].uid !== target.uid) continue;
		panes[i] = { ...panes[i], area: first };
		break;
	}
	panes.push({ uid: next, area, tabs: [uid], active: uid });

	return compact({
		...base,
		rows: axis === ROW ? [...base.rows, line] : base.rows,
		cols: axis === COL ? [...base.cols, line] : base.cols,
		panes,
		focus: next,
		rowsSeq: axis === ROW ? base.rowsSeq + 1 : base.rowsSeq,
		colsSeq: axis === COL ? base.colsSeq + 1 : base.colsSeq,
		panesSeq: base.panesSeq + 1,
	});
}

export function create(initial: State, config: Config = {}) {
	let state = initial;
	let listeners = new Set<Listener>();

	function emit() {
		for (let listener of listeners) listener();
	}

	function get() {
		return state;
	}

	function set(next: (state: State) => State) {
		let value = next(state);
		if (Object.is(value, state)) return false;

		state = value;
		emit();
		return true;
	}

	function subscribe(listener: Listener) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}

	return {
		get,
		subscribe,
		view(data: View) {
			return view(state, { ...data, min: data.min ?? config.min });
		},
		can(data: Check) {
			return can(state, { ...data, min: data.min ?? config.min });
		},
		open(data?: Open) {
			return set(state =>
				open(
					state,
					data && {
						...data,
						fit: data.fit && { ...data.fit, min: data.fit.min ?? config.min },
					},
				)
			);
		},
		select(data: Select) {
			return set(state => select(state, data));
		},
		move(data: Move) {
			return set(state =>
				move(state, {
					...data,
					fit: data.fit && { ...data.fit, min: data.fit.min ?? config.min },
				})
			);
		},
		focus(data: Focus) {
			return set(state => focus(state, data));
		},
		close(data: Close) {
			return set(state => close(state, data));
		},
		resize(data: Resize) {
			return set(state => resize(state, { ...data, min: data.min ?? config.min }));
		},
	};
}

export type Api = ReturnType<typeof create>;
