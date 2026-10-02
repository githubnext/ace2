import * as fuzzysort from "fuzzysort";

import type { CommandPaletteItem, CommandPaletteResult } from "./types";

function text(item: CommandPaletteItem) {
	return [item.group, item.label, item.id, ...(item.keywords || [])].join(" ");
}

function visible(item: CommandPaletteItem, query: string) {
	if (query) return true;
	if (item.hiddenUntilSearch) return false;
	if (item.kind === "session" && item.archived) return false;
	return true;
}

function byGroup(a: CommandPaletteItem, b: CommandPaletteItem) {
	return a.group.localeCompare(b.group) || a.label.localeCompare(b.label);
}

export function filterCommandPaletteItems(
	items: CommandPaletteItem[],
	query: string,
): CommandPaletteResult[] {
	let q = query.trim();
	let values = items.map(item => ({ item, value: text(item) }));

	if (!q) {
		return values
			.filter(({ item }) => visible(item, q))
			.sort((a, b) => byGroup(a.item, b.item));
	}

	let matches = fuzzysort.go(q, values, { key: "value" });
	return matches
		.map(match => match.obj)
		.filter(({ item }) => visible(item, q));
}

export function firstEnabled(results: CommandPaletteResult[]) {
	return results.findIndex(({ item }) => !item.disabled);
}
