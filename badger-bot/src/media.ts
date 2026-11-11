import type { DiscordMessage, FileUpload } from "./discord.ts";
import { describeAttachment } from "./documents.ts";

/** Images sent per question, newest first; each one uses more of the plan. */
const MAX_IMAGES = 4;
/** Images the model can open itself during one answer (read on an image link). */
export const MAX_OPENED_IMAGES = 6;
/**
 * Images come at full size: Discord's resizing proxy (media.discordapp.net)
 * refuses Cloudflare's servers, so the model scales them down itself. These
 * cap one image, and all the images one question sends.
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 16 * 1024 * 1024;
/** Formats the model accepts (GIFs may be animated, which it doesn't). */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_LINK = /\.(png|jpe?g|webp)$/i;
const MAX_PREVIEW_DESCRIPTION = 500;

interface ImageSource {
	url: string;
	/** Known for attachments, so big ones are skipped without downloading. */
	bytes?: number;
}

const isImageType = (type?: string) => IMAGE_TYPES.has((type ?? "").split(";")[0]);

/** A message and the messages forwarded in it (Discord keeps those apart). */
function withForwarded(message: DiscordMessage): Array<Pick<DiscordMessage, "content" | "attachments" | "embeds">> {
	return [message, ...(message.message_snapshots ?? []).map((snapshot) => snapshot.message)];
}

function imageSources(message: DiscordMessage): ImageSource[] {
	return withForwarded(message).flatMap((m) => [
		...(m.attachments ?? []).filter((a) => isImageType(a.content_type)).map((a) => ({ url: a.url, bytes: a.size })),
		// A pasted image link shows up as an image embed.
		...(m.embeds ?? []).filter((e) => e.type === "image" && (e.image ?? e.thumbnail)).map((e) => ({ url: (e.image ?? e.thumbnail)!.url })),
	]);
}

/** How many images a message carries (attached, pasted as links, or forwarded). */
export function imageCount(message: DiscordMessage): number {
	return imageSources(message).length;
}

/** Links to a message's attached images, which read can open. */
export function imageLinks(message: DiscordMessage): string[] {
	return withForwarded(message).flatMap((m) => (m.attachments ?? []).filter((a) => isImageType(a.content_type)).map((a) => `[image: ${a.url}]`));
}

/** Forwarded messages' text. */
export function forwardedText(message: DiscordMessage): string[] {
	return (message.message_snapshots ?? []).filter((s) => s.message.content?.trim()).map((s) => `[forwarded: ${s.message.content}]`);
}

/** A link through Discord's resizing proxy points at the same file on the CDN, which Cloudflare can fetch. */
function fetchable(url: string): string {
	const parsed = new URL(url);
	if (parsed.hostname === "media.discordapp.net") parsed.hostname = "cdn.discordapp.com";
	return parsed.toString();
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** An image as a data URL, or why it can't be used. */
async function download(url: string): Promise<{ dataUrl: string } | { problem: string }> {
	try {
		const response = await fetch(fetchable(url));
		const type = (response.headers.get("Content-Type") ?? "").split(";")[0];
		if (!response.ok || !isImageType(type)) {
			await response.body?.cancel();
			return { problem: response.ok ? `it's ${type || "not an image"}, not PNG, JPEG or WebP` : `the link answered ${response.status}` };
		}
		if (Number(response.headers.get("Content-Length") ?? 0) > MAX_IMAGE_BYTES) {
			await response.body?.cancel();
			return { problem: "it's over 10 MB" };
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > MAX_IMAGE_BYTES) return { problem: "it's over 10 MB" };
		return { dataUrl: `data:${type};base64,${toBase64(bytes)}` };
	} catch (error) {
		return { problem: `it couldn't be downloaded (${error instanceof Error ? error.message : String(error)})` };
	}
}

/**
 * Downloads the newest images in the conversation (the mention's own first)
 * as data URLs, keyed by message ID.
 */
export async function loadImages(messages: DiscordMessage[]): Promise<Map<string, string[]>> {
	const wanted: Array<{ messageId: string; source: ImageSource }> = [];
	let budget = MAX_TOTAL_IMAGE_BYTES;
	for (const message of [...messages].reverse()) {
		for (const source of imageSources(message)) {
			if (wanted.length >= MAX_IMAGES) break;
			const size = source.bytes ?? MAX_IMAGE_BYTES / 4;
			if (size > MAX_IMAGE_BYTES || size > budget) continue;
			budget -= size;
			wanted.push({ messageId: message.id, source });
		}
	}
	const images = new Map<string, string[]>();
	const downloaded = await Promise.all(wanted.map(({ source }) => download(source.url)));
	const problems: string[] = [];
	wanted.forEach(({ messageId }, i) => {
		const result = downloaded[i];
		if ("dataUrl" in result) images.set(messageId, [...(images.get(messageId) ?? []), result.dataUrl]);
		else problems.push(result.problem);
	});
	if (wanted.length) console.log("images", { found: wanted.length, read: wanted.length - problems.length, ...(problems.length && { problems }) });
	return images;
}

/** An image link as a file to post (images in posts are re-uploaded, not linked). */
export async function imageFile(link: string): Promise<FileUpload | { problem: string }> {
	if (!/^https:\/\//.test(link)) return { problem: "only https links can be attached" };
	try {
		const response = await fetch(fetchable(link));
		const type = (response.headers.get("Content-Type") ?? "").split(";")[0];
		if (!response.ok || !type.startsWith("image/")) {
			await response.body?.cancel();
			return { problem: response.ok ? `it's ${type || "not an image"}` : `the link answered ${response.status}` };
		}
		const data = new Uint8Array(await response.arrayBuffer());
		if (data.byteLength > MAX_IMAGE_BYTES) return { problem: "it's over 10 MB" };
		const name = decodeURIComponent(new URL(link).pathname.split("/").pop() || "image");
		return { name, type, data };
	} catch (error) {
		return { problem: `it couldn't be downloaded (${error instanceof Error ? error.message : String(error)})` };
	}
}

/** Whether a link looks like an image the model could open. */
export function isImageLink(link: string): boolean {
	try {
		return IMAGE_LINK.test(new URL(link).pathname);
	} catch {
		return false;
	}
}

/** Opens one image by its link so the model can look at it. */
export async function openImage(link: string): Promise<{ dataUrl: string } | { problem: string }> {
	if (!/^https:\/\//.test(link)) return { problem: "only https links can be opened" };
	const result = await download(link);
	console.log("opened image", { ok: "dataUrl" in result });
	return result;
}

/**
 * Text for what Discord shows under links (YouTube videos, articles): the
 * model can't watch videos, but it can read their title and description.
 */
export function linkPreviews(message: DiscordMessage): string[] {
	return (message.embeds ?? [])
		.filter((e) => e.type !== "image" && e.type !== "gifv" && (e.title || e.description))
		.map((e) => {
			const source = [e.provider?.name, e.author?.name].filter(Boolean).join(", ");
			const description = e.description && e.description.length > MAX_PREVIEW_DESCRIPTION ? `${e.description.slice(0, MAX_PREVIEW_DESCRIPTION)}…` : e.description;
			return `[Link preview${source ? ` (${source})` : ""}: ${e.title ?? ""}${description ? ` — ${description}` : ""}${e.url ? ` <${e.url}>` : ""}]`;
		});
}

/** Non-image attachments, named with their link (documents.ts reads what it can). */
export function otherAttachments(message: DiscordMessage): string[] {
	return withForwarded(message)
		.flatMap((m) => m.attachments ?? [])
		.filter((a) => !isImageType(a.content_type))
		.map(describeAttachment);
}
