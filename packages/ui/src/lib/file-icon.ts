import type { ComponentType } from "react";
import {
	IconBraces,
	IconCode,
	IconConsole,
	IconDatabase,
	IconFile,
	IconFileArchive,
	IconFileText,
	IconFilm,
	IconImage,
	IconMusic,
	IconPaintBucket,
} from "../icons";

type Icon = ComponentType<{ className?: string; size?: number | string }>;

const CODE = IconCode;
const DATA = IconBraces;
const STYLE = IconPaintBucket;
const TEXT = IconFileText;
const IMAGE = IconImage;
const VIDEO = IconFilm;
const AUDIO = IconMusic;
const ARCHIVE = IconFileArchive;
const DATABASE = IconDatabase;
const SHELL = IconConsole;
const DEFAULT: Icon = IconFile;

const MAP: Record<string, Icon> = {
	ts: CODE,
	tsx: CODE,
	js: CODE,
	jsx: CODE,
	mjs: CODE,
	cjs: CODE,
	rs: CODE,
	py: CODE,
	go: CODE,
	rb: CODE,
	java: CODE,
	kt: CODE,
	swift: CODE,
	c: CODE,
	cc: CODE,
	cpp: CODE,
	h: CODE,
	hpp: CODE,
	cs: CODE,
	php: CODE,
	lua: CODE,
	ex: CODE,
	exs: CODE,
	html: CODE,
	xml: CODE,
	svelte: CODE,
	vue: CODE,
	astro: CODE,

	json: DATA,
	yaml: DATA,
	yml: DATA,
	toml: DATA,
	ini: DATA,
	env: DATA,

	css: STYLE,
	scss: STYLE,
	sass: STYLE,
	less: STYLE,

	md: TEXT,
	mdx: TEXT,
	txt: TEXT,
	rst: TEXT,
	pdf: TEXT,

	png: IMAGE,
	jpg: IMAGE,
	jpeg: IMAGE,
	gif: IMAGE,
	webp: IMAGE,
	svg: IMAGE,
	ico: IMAGE,
	avif: IMAGE,
	bmp: IMAGE,
	tiff: IMAGE,

	mp4: VIDEO,
	webm: VIDEO,
	mov: VIDEO,
	avi: VIDEO,
	mkv: VIDEO,

	mp3: AUDIO,
	wav: AUDIO,
	flac: AUDIO,
	ogg: AUDIO,
	m4a: AUDIO,

	zip: ARCHIVE,
	tar: ARCHIVE,
	gz: ARCHIVE,
	bz2: ARCHIVE,
	"7z": ARCHIVE,
	rar: ARCHIVE,

	db: DATABASE,
	sqlite: DATABASE,
	sqlite3: DATABASE,

	sh: SHELL,
	zsh: SHELL,
	bash: SHELL,
	fish: SHELL,
	ps1: SHELL,
};

/**
 * Return the icon component for a file path based on its extension,
 * falling back to a generic file icon when the extension is unknown.
 */
function iconFor(path: string): Icon {
	let slash = path.lastIndexOf("/");
	let name = slash >= 0 ? path.slice(slash + 1) : path;
	let dot = name.lastIndexOf(".");
	if (dot <= 0 || dot === name.length - 1) return DEFAULT;
	return MAP[name.slice(dot + 1).toLowerCase()] || DEFAULT;
}

export { iconFor };
export type { Icon };
