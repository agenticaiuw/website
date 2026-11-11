// Files people attach in Discord, other than images: text and code files and
// Word, PowerPoint and Excel files are read into the conversation, and PDFs
// go to the model as files. Anything else is named with its link.
import type { DiscordAttachment, DiscordMessage, FileUpload } from "./discord.ts";
import { officeText } from "./drive.ts";
import type { FunctionTool } from "./openai.ts";

/** Attachments read per question, newest first. */
const MAX_DOCUMENTS = 4;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_OFFICE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
/** Text kept per attachment. */
const MAX_DOCUMENT_CHARS = 30_000;

const TEXT_EXTENSIONS =
	/\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|toml|xml|html?|css|m?js|cjs|tsx?|jsx|py|ipynb|java|c|h|cc|cpp|hpp|cs|go|rs|rb|php|swift|kt|sql|sh|bash|zsh|ini|cfg|conf|env\.example|log|tex|r|lua|dart|vue|svelte)$/i;
const IMAGE = /^image\//;

/** A file for the model, as the Responses API's input_file takes it. */
export interface InputFile {
	filename: string;
	/** A data URL. */
	data: string;
}

export interface LoadedDocuments {
	/** Text notes per message: file contents, or why a file wasn't read. */
	notes: Map<string, string[]>;
	/** PDFs per message. */
	files: Map<string, InputFile[]>;
}

function size(bytes: number | undefined): string {
	if (!bytes) return "";
	return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

function clip(text: string): string {
	return text.length > MAX_DOCUMENT_CHARS ? `${text.slice(0, MAX_DOCUMENT_CHARS)}\n[… cut off after ${MAX_DOCUMENT_CHARS} of ${text.length} characters]` : text;
}

/** How a non-image attachment is named in the conversation, with its link. */
export function describeAttachment(a: DiscordAttachment): string {
	return `[Attached file: ${a.filename}${a.size ? ` (${size(a.size)})` : ""} <${a.url}>]`;
}

export function documentAttachments(message: DiscordMessage): DiscordAttachment[] {
	return (message.attachments ?? []).filter((a) => !IMAGE.test(a.content_type ?? ""));
}

async function read(a: DiscordAttachment): Promise<{ note?: string; file?: InputFile }> {
	const name = a.filename;
	const type = (a.content_type ?? "").split(";")[0];
	const isPdf = type === "application/pdf" || /\.pdf$/i.test(name);
	const isOffice = /\.(docx|docm|dotx|pptx|pptm|potx|xlsx|xlsm|xltx)$/i.test(name);
	const isText = TEXT_EXTENSIONS.test(name) || type.startsWith("text/") || type === "application/json";
	if (!isPdf && !isOffice && !isText) return {};
	const limit = isPdf ? MAX_PDF_BYTES : isOffice ? MAX_OFFICE_BYTES : MAX_TEXT_BYTES;
	if ((a.size ?? 0) > limit) return { note: `[${name} is too large to read here (${size(a.size)}).]` };
	const res = await fetch(a.url);
	if (!res.ok) return { note: `[Couldn't download ${name}.]` };
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (isPdf) return { note: `[${name} is included as a file.]`, file: { filename: name, data: `data:application/pdf;base64,${toBase64(bytes)}` } };
	const text = isOffice ? officeText(name, bytes) : new TextDecoder().decode(bytes);
	if (!text?.trim()) return { note: `[${name} has no readable text.]` };
	return { note: `[Contents of ${name}:\n${clip(text.trim())}\n]` };
}

/** Discord's file hosts; reading a link is limited to these, so it can't be used to fetch arbitrary pages. */
const DISCORD_FILE_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

export function isDiscordFileUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" && DISCORD_FILE_HOSTS.has(parsed.hostname);
	} catch {
		return false;
	}
}

/** Reads a Discord attachment by its link (from a channel or an earlier reply). */
export async function readAttachmentUrl(url: string): Promise<string> {
	if (!isDiscordFileUrl(url)) return "Only Discord attachment links (cdn.discordapp.com) can be read this way.";
	const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "file");
	const head = await fetch(url, { method: "HEAD" }).catch(() => null);
	const type = head?.headers.get("content-type") ?? "";
	const { note, file } = await read({ id: "", filename: name, url, content_type: type, size: Number(head?.headers.get("content-length") ?? 0) });
	if (file) return `[${name} is a PDF; ask them to attach it to their message so you can read it.]`;
	return note ?? `[${name} isn't a kind of file you can read (only text, code, Word, PowerPoint, Excel and PDF).]`;
}

/** Reads the newest non-image attachments in the conversation (the mention's first). */
export async function loadDocuments(messages: DiscordMessage[]): Promise<LoadedDocuments> {
	const wanted: Array<{ messageId: string; attachment: DiscordAttachment }> = [];
	for (const message of [...messages].reverse()) {
		for (const attachment of documentAttachments(message)) {
			if (wanted.length < MAX_DOCUMENTS) wanted.push({ messageId: message.id, attachment });
		}
	}
	const results = await Promise.all(
		wanted.map(({ attachment }) =>
			read(attachment).catch((error) => {
				console.error("couldn't read an attachment", error);
				return { note: `[Couldn't read ${attachment.filename}.]` } as { note?: string; file?: InputFile };
			}),
		),
	);
	const loaded: LoadedDocuments = { notes: new Map(), files: new Map() };
	wanted.forEach(({ messageId }, i) => {
		const { note, file } = results[i];
		if (note) loaded.notes.set(messageId, [...(loaded.notes.get(messageId) ?? []), note]);
		if (file) loaded.files.set(messageId, [...(loaded.files.get(messageId) ?? []), file]);
	});
	return loaded;
}

const MAX_OUT_FILES = 5;
const MAX_OUT_CHARS = 1_000_000;
const OUT_TYPES: Record<string, string> = {
	md: "text/markdown",
	txt: "text/plain",
	csv: "text/csv",
	tsv: "text/tab-separated-values",
	json: "application/json",
	html: "text/html",
	css: "text/css",
	js: "text/javascript",
	ts: "text/plain",
	py: "text/x-python",
	svg: "image/svg+xml",
	xml: "application/xml",
	yaml: "text/yaml",
	yml: "text/yaml",
	ics: "text/calendar",
	sh: "text/x-shellscript",
	sql: "text/plain",
};

/** Lets the bot send a text-based file it wrote, attached to its reply. */
export function attachFileTool(outbox: FileUpload[]): FunctionTool {
	return {
		name: "attach_file",
		description:
			"Attach a text-based file you wrote to your reply, like notes (.md), a spreadsheet (.csv), a calendar event (.ics), a web page (.html), an SVG or code. Use it when someone asks for a file or the content is too long for a message.",
		parameters: {
			type: "object",
			properties: {
				filename: { type: "string", description: "With an extension, like notes.md or roster.csv" },
				content: { type: "string" },
			},
			required: ["filename", "content"],
			additionalProperties: false,
		},
		async run(args) {
			const filename = String(args.filename ?? "").trim().replace(/[^\w.\- ]/g, "_").slice(0, 100);
			const ext = filename.split(".").pop()?.toLowerCase() ?? "";
			if (!filename || !OUT_TYPES[ext]) return `Not attached: use one of these extensions: ${Object.keys(OUT_TYPES).join(", ")}.`;
			const content = String(args.content ?? "");
			if (content.length > MAX_OUT_CHARS) return "Not attached: the file is too long.";
			if (outbox.length >= MAX_OUT_FILES) return `Not attached: at most ${MAX_OUT_FILES} files per reply.`;
			outbox.push({ name: filename, type: OUT_TYPES[ext], data: new TextEncoder().encode(content) });
			return `Attached ${filename} to your reply.`;
		},
	};
}
