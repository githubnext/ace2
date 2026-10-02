// Consumers bundle this package with a CSS-aware bundler (Vite/Bun) that resolves these imports.
declare module "*.css";

interface ImportMeta {
	readonly url: string;
}
