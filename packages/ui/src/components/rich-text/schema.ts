import { Schema } from "prosemirror-model";
import { schema as base } from "prosemirror-markdown";

const nodes = base.spec.nodes.addBefore("text", "emoji", {
	group: "inline",
	inline: true,
	atom: true,
	selectable: false,
	leafText: (node) => `:${node.attrs.name}:`,
	attrs: {
		id: {},
		name: {},
		src: {},
	},
	toDOM: (node) => [
		"img",
		{
			class: "custom-emoji",
			src: node.attrs.src,
			alt: node.attrs.name,
			title: `:${node.attrs.name}:`,
			"data-emoji-id": node.attrs.id,
		},
	],
	parseDOM: [{
		tag: "img[data-emoji-id]",
		getAttrs: (dom) => ({
			id: (dom as HTMLElement).getAttribute("data-emoji-id"),
			name: (dom as HTMLElement).getAttribute("alt"),
			src: (dom as HTMLElement).getAttribute("src"),
		}),
	}],
}).addBefore("text", "mention", {
	group: "inline",
	inline: true,
	atom: true,
	selectable: false,
	leafText: (node) => `@${node.attrs.name}`,
	attrs: {
		id: { default: null },
		name: {},
		avatar: { default: null },
	},
	toDOM: (node) => [
		"span",
		{
			class: "mention",
			"data-mention-id": node.attrs.id,
			"data-mention-name": node.attrs.name,
		},
		...(node.attrs.avatar
			? [
				["img", {
					class: "mention-avatar",
					src: node.attrs.avatar,
					alt: "",
				}] as const,
			]
			: []),
		node.attrs.name,
	],
	parseDOM: [{
		tag: "span[data-mention-name]",
		getAttrs: (dom) => ({
			id: (dom as HTMLElement).getAttribute("data-mention-id"),
			name: (dom as HTMLElement).getAttribute("data-mention-name"),
			avatar: (dom as HTMLElement).querySelector("img")?.getAttribute("src") || null,
		}),
	}],
}).addBefore("text", "document", {
	group: "inline",
	inline: true,
	atom: true,
	selectable: false,
	leafText: (node) => `&${node.attrs.name}`,
	attrs: {
		uid: {},
		name: {},
	},
	toDOM: (node) => [
		"span",
		{
			class: "document-reference",
			"data-document-uid": node.attrs.uid,
			"data-document-name": node.attrs.name,
		},
		["span", { class: "document-reference-copy" }, "&"],
		node.attrs.name,
	],
	parseDOM: [{
		tag: "span[data-document-uid][data-document-name]",
		getAttrs: (dom) => ({
			uid: (dom as HTMLElement).getAttribute("data-document-uid"),
			name: (dom as HTMLElement).getAttribute("data-document-name"),
		}),
	}],
}).addBefore("text", "plan", {
	group: "inline",
	inline: true,
	atom: true,
	selectable: false,
	leafText: () => "&plan.md",
	toDOM: () => [
		"span",
		{
			class: "document-reference",
			"data-plan-reference": "",
		},
		["span", { class: "document-reference-copy" }, "&"],
		"plan.md",
	],
	parseDOM: [{ tag: "span[data-plan-reference]" }],
});

const marks = base.spec.marks
	.addToEnd("underline", {
		parseDOM: [
			{ tag: "u" },
			{
				style: "text-decoration",
				getAttrs: (value) =>
					typeof value === "string" && value.includes("underline")
						? null
						: false,
			},
		],
		toDOM: () => ["u", 0],
	})
	.addToEnd("strike", {
		parseDOM: [
			{ tag: "s" },
			{ tag: "del" },
			{ tag: "strike" },
			{
				style: "text-decoration",
				getAttrs: (value) =>
					typeof value === "string" && value.includes("line-through")
						? null
						: false,
			},
		],
		toDOM: () => ["s", 0],
	});

const schema = new Schema({ nodes, marks });

export { schema };
