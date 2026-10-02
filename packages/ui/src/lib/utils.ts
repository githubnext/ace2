import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names with Tailwind-aware deduplication */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function isUrl(value: string) {
	let text = value.trim();
	if (!text || /\s/.test(text)) return false;
	let scheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
	try {
		let url = new URL(scheme ? text : `https://${text}`);
		if (scheme) {
			return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
				|| url.protocol === "ace:";
		}
		let host = url.hostname;
		return (
			host === "localhost"
			|| host.includes(".")
			|| /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
			|| host.includes(":")
		);
	} catch {
		return false;
	}
}
