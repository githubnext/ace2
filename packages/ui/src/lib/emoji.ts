import data from "@emoji-mart/data";
import { init } from "emoji-mart";

// Resolved relative to this module so the package needs no bundler-specific asset imports.
const aceLogo = new URL("../assets/ace-logo.png", import.meta.url).href;
const aceAvatar = new URL("../assets/ace-avatar.svg", import.meta.url).href;

// TODO(@terkelg): Make custom emojis user/team-configurable. Could live in the
// repo (e.g. `.github/emojis/`) so teams can add their own and they sync via git.
const CUSTOM = [
	{
		id: "ace",
		name: "Ace",
		emojis: [
			{
				id: "ace",
				name: "Ace",
				keywords: ["ace", "logo", "github"],
				skins: [{ src: aceLogo }],
			},
		],
	},
];

/** Render-side metadata for a custom emoji. */
type CustomEmoji = { src: string; alt: string };

let custom = new Map<string, CustomEmoji>();
for (let category of CUSTOM) {
	for (let e of category.emojis) {
		let src = e.skins[0]?.src;
		if (!src) continue;
		let value = { src, alt: e.name };
		custom.set(e.id.toLowerCase(), value);
		custom.set(e.name.toLowerCase(), value);
	}
}

/** Initialize emoji-mart data with custom emojis. Safe to call multiple times. */
function initEmoji() {
	init({ data, custom: CUSTOM });
}

/** Look up a custom emoji's image source by id (e.g. `"ace"`). */
function lookupCustomEmoji(id: string): CustomEmoji | undefined {
	return custom.get(id.toLowerCase());
}

function customEmojiSrc(id: string): string | undefined {
	return lookupCustomEmoji(id)?.src;
}

export {
	aceAvatar,
	aceLogo,
	CUSTOM,
	type CustomEmoji,
	customEmojiSrc,
	initEmoji,
	lookupCustomEmoji,
};

export type Emoji = {
	/** Native emoji character. */
	native?: string;
	/** Emoji short name/id. */
	id: string;
};

/** Picked emoji as a string — native glyph when available, otherwise the `:id:` shortcode. */
export function pick(emoji: Emoji): string {
	return emoji.native || `:${emoji.id}:`;
}
