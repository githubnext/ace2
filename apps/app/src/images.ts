import type { Image } from "@ace/channel/protocol";
import type { Attachment } from "@ace/ui";

/** Matches the channel's per-message limit, with room for the message's text. */
const BUDGET = 1_400_000;
const EDGE = 2000;

async function encode(url: string, edge: number, quality: number): Promise<Image> {
	const bitmap = await createImageBitmap(await (await fetch(url)).blob());
	const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
	const canvas = new OffscreenCanvas(
		Math.round(bitmap.width * scale),
		Math.round(bitmap.height * scale),
	);
	canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return { mimeType: "image/jpeg", data: btoa(binary) };
}

/**
 * Re-encode attached images as JPEG, shrinking until the message fits the channel's limit. This
 * also strips metadata such as location from photos.
 */
export async function images(attachments: Attachment[]): Promise<Image[]> {
	const sources = attachments.filter((item) => item.type.startsWith("image/") && item.preview);
	if (sources.length < attachments.length) throw new Error("Only images can be attached");
	for (let edge = EDGE, quality = 0.9; edge >= 400; edge = Math.round(edge * 0.75), quality = 0.8) {
		const encoded = await Promise.all(sources.map((item) => encode(item.preview!, edge, quality)));
		if (encoded.reduce((size, image) => size + image.data.length, 0) <= BUDGET) return encoded;
	}
	throw new Error("These images are too large to send together");
}
