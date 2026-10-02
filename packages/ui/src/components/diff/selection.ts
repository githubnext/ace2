type Selection = {
	file: string;
	key?: string | number;
};

function selection(
	names: Set<string>,
	file?: string,
	key?: string | number,
): Selection | undefined {
	if (!file || !names.has(file)) return;
	return { file, key };
}

function same(a: Selection | undefined, b: Selection | undefined) {
	if (!a || !b) return a === b;
	return a.file === b.file && a.key === b.key;
}

export { same, selection };
export type { Selection };
