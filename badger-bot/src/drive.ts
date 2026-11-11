// Reads the club's public Google Drive folder without an API key: folder
// listings from Drive's embeddable folder view, Google Docs, Sheets and Slides
// through their export links, and uploaded files by direct download.
import { strFromU8, unzipSync } from "fflate";

export type DriveKind = "document" | "spreadsheets" | "presentation" | "forms" | "file";

export interface DriveEntry {
	id: string;
	/** Folders and name, like "Teams/Business/Outreach Document". */
	path: string;
	kind: DriveKind;
	/** Where to open it in Google Drive. */
	url: string;
	/** "Last modified" as Drive shows it: a time for today, otherwise a date. */
	modified: string;
}

const MAX_FOLDERS = 200;
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
/** Text kept per file. */
export const MAX_FILE_CHARS = 200_000;
/** Spreadsheet columns read per row. */
const MAX_COLUMNS = 100;

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code: string) => {
		const lower = code.toLowerCase();
		try {
			if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
			if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
		} catch {
			return match;
		}
		return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[lower] ?? match;
	});
}

function tidy(text: string): string {
	return text
		.replace(/^﻿/, "")
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t ]+/g, " ")
		.replace(/ ?\n ?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.slice(0, MAX_FILE_CHARS);
}

const ENTRY =
	/<div class="flip-entry" id="entry-([^"]+)".*?<a href="([^"]+)".*?<div class="flip-entry-title">(.*?)<\/div>.*?<div class="flip-entry-last-modified"><div>(.*?)<\/div>/gs;

async function listFolder(folderId: string) {
	const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`);
	if (!res.ok) throw new Error(`listing folder ${folderId}: HTTP ${res.status}`);
	const html = await res.text();
	return [...html.matchAll(ENTRY)].map((m) => ({
		id: m[1],
		url: decodeEntities(m[2]),
		name: decodeEntities(m[3]).trim(),
		modified: decodeEntities(m[4]).trim(),
	}));
}

/** Every file under a public folder, through its subfolders. Throws if any listing fails. */
export async function walkDrive(rootId: string): Promise<DriveEntry[]> {
	const files: DriveEntry[] = [];
	const folders = [{ id: rootId, path: "" }];
	for (let seen = 0; folders.length && seen < MAX_FOLDERS; seen++) {
		const folder = folders.shift()!;
		for (const item of await listFolder(folder.id)) {
			const path = folder.path ? `${folder.path}/${item.name}` : item.name;
			if (item.url.includes("/drive/folders/")) {
				folders.push({ id: item.id, path });
				continue;
			}
			const kind = /docs\.google\.com\/(document|spreadsheets|presentation|forms)\//.exec(item.url)?.[1] as DriveKind | undefined;
			files.push({ id: item.id, path, kind: kind ?? "file", url: item.url, modified: item.modified });
		}
	}
	return files;
}

async function download(url: string): Promise<Response> {
	const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; BadgerBot/1.0)" } });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	if (new URL(res.url).hostname === "accounts.google.com") throw new Error("not shared publicly");
	const size = Number(res.headers.get("content-length") ?? 0);
	if (size > MAX_DOWNLOAD_BYTES) {
		await res.body?.cancel();
		throw new Error(`too large to read (${Math.round(size / 1024 / 1024)} MB)`);
	}
	return res;
}

/** Text of a Google Docs/Slides export, which Google serves as plain text. */
async function exportedText(url: string): Promise<string> {
	const res = await download(url);
	if (res.headers.get("content-type")?.startsWith("text/html")) throw new Error("not shared publicly");
	return tidy(await res.text());
}

/** Office files are zip archives of XML. */
function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, string> {
	const files = unzipSync(bytes, { filter: (file) => wanted(file.name) });
	return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

function attr(tag: string, name: string): string {
	return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
}

function xmlText(xml: string): string {
	return decodeEntities(xml.replace(/<[^>]+>/g, ""));
}

function wordText(bytes: Uint8Array): string {
	const xml = unzip(bytes, (name) => name === "word/document.xml")["word/document.xml"] ?? "";
	return tidy(
		xmlText(
			xml
				.replace(/<w:tab\/>/g, "\t")
				.replace(/<w:br\/>|<\/w:p>|<\/w:tr>/g, "\n")
				.replace(/<\/w:tc>/g, " | "),
		),
	);
}

function slidesText(bytes: Uint8Array): string {
	const files = unzip(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
	const number = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1]);
	const slides = Object.keys(files).sort((a, b) => number(a) - number(b));
	return tidy(slides.map((name) => `Slide ${number(name)}:\n${xmlText(files[name].replace(/<\/a:p>|<a:br\/>/g, "\n"))}`).join("\n\n"));
}

function columnIndex(ref: string): number {
	let index = 0;
	for (const letter of /^[A-Z]+/.exec(ref)?.[0] ?? "") index = index * 26 + letter.charCodeAt(0) - 64;
	return index - 1;
}

/** Spreadsheets store dates as day counts since 1899-12-30, styled as dates. */
function dateStyles(styles: string): Set<number> {
	const custom = new Map([...styles.matchAll(/<(?:\w+:)?numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], "numFmtId")), attr(m[0], "formatCode")]));
	const isDateFormat = (id: number) => {
		if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
		const code = decodeEntities(custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
		return /[dmyhs]/i.test(code) && !/^general$/i.test(code);
	};
	const xfs = /<(?:\w+:)?cellXfs\b[^>]*>(.*?)<\/(?:\w+:)?cellXfs>/s.exec(styles)?.[1] ?? "";
	const dates = new Set<number>();
	[...xfs.matchAll(/<(?:\w+:)?xf\b[^>]*>/g)].forEach((m, index) => {
		if (isDateFormat(Number(attr(m[0], "numFmtId")))) dates.add(index);
	});
	return dates;
}

function fromSerialDate(serial: number): string {
	const date = new Date(Math.round((serial - 25569) * 86_400_000));
	if (Number.isNaN(date.getTime())) return String(serial);
	const iso = date.toISOString();
	return serial % 1 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function sheetsText(bytes: Uint8Array): string {
	const files = unzip(bytes, (name) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(name));
	// Some writers prefix every tag with a namespace, like <x:row>.
	const runs = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>(.*?)<\/(?:\w+:)?t>/gs)].map((t) => decodeEntities(t[1])).join("");
	const shared = [...(files["xl/sharedStrings.xml"] ?? "").matchAll(/<(?:\w+:)?si\b[^>]*>(.*?)<\/(?:\w+:)?si>/gs)].map((m) => runs(m[1]));
	const dates = dateStyles(files["xl/styles.xml"] ?? "");
	const targets = new Map(
		[...(files["xl/_rels/workbook.xml.rels"] ?? "").matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]),
	);
	const sheets = [...(files["xl/workbook.xml"] ?? "").matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map((m) => {
		const target = (targets.get(attr(m[0], "\\w+:id")) ?? "").replace(/^\/?(xl\/)?/, "");
		return { name: decodeEntities(attr(m[0], "name")), xml: files[`xl/${target}`] ?? "" };
	});

	const out: string[] = [];
	for (const sheet of sheets) {
		const lines: string[] = [];
		for (const row of sheet.xml.matchAll(/<(?:\w+:)?row\b[^>]*>(.*?)<\/(?:\w+:)?row>/gs)) {
			const cells: string[] = [];
			for (const cell of row[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>(.*?)<\/(?:\w+:)?c>)/gs)) {
				const tag = cell[1];
				const inner = cell[2] ?? "";
				const ref = attr(tag, "r");
				const column = ref ? columnIndex(ref) : cells.length;
				if (column >= MAX_COLUMNS) continue;
				const type = attr(tag, "t");
				const raw = /<(?:\w+:)?v>(.*?)<\/(?:\w+:)?v>/s.exec(inner)?.[1];
				let value: string;
				if (type === "s") value = shared[Number(raw)] ?? "";
				else if (type === "inlineStr") value = runs(inner);
				else if (raw !== undefined && !type && dates.has(Number(attr(tag, "s") || 0))) value = fromSerialDate(Number(raw));
				else value = decodeEntities(raw ?? "");
				cells[column] = value.replace(/\s+/g, " ").trim();
			}
			const line = Array.from(cells, (value) => value ?? "").join(" | ");
			if (line.replace(/[\s|]/g, "")) lines.push(line.replace(/( \| )+$/, ""));
		}
		if (lines.length) out.push(`Sheet "${sheet.name}":\n${lines.join("\n")}`);
	}
	return tidy(out.join("\n\n"));
}

function htmlText(html: string): string {
	// Some exported slide decks keep their slides as HTML in a JSON string.
	const templates = [...html.matchAll(/<script\b[^>]*type="[^"]*template[^"]*"[^>]*>(.*?)<\/script>/gis)].map((m) => {
		try {
			const value = JSON.parse(m[1]);
			return typeof value === "string" ? value : "";
		} catch {
			return "";
		}
	});
	return tidy(
		decodeEntities(
			[html, ...templates]
				.join("\n")
				.replace(/<(script|style|svg|noscript)\b.*?<\/\1>/gis, " ")
				.replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n")
				.replace(/<[^>]+>/g, " "),
		),
	);
}

/** A Google Form: its title, description, questions, and the link for filling it out. */
async function formText(id: string): Promise<string> {
	const res = await download(`https://docs.google.com/forms/d/${id}/viewform`);
	const html = await res.text();
	const json = /FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/s.exec(html)?.[1];
	if (!json) throw new Error("not shared publicly");
	const data = JSON.parse(json) as unknown[];
	const form = (data[1] ?? []) as unknown[];
	const title = String(data[3] ?? form[8] ?? "Untitled form");
	const description = typeof form[0] === "string" ? form[0] : "";
	const questions = ((form[1] ?? []) as unknown[][]).map((item) => item?.[1]).filter((q): q is string => typeof q === "string" && q.trim() !== "");
	return tidy(
		[`Google Form: ${title}`, `Link for filling it out: ${res.url}`, description, questions.length ? `Questions:\n${questions.map((q) => `- ${q}`).join("\n")}` : ""]
			.filter(Boolean)
			.join("\n\n"),
	);
}

const MEDIA = /\.(mov|mp4|m4v|webm|avi|mkv|mp3|m4a|wav|aac|png|jpe?g|gif|webp|heic|svg|ico|zip)$/i;

/** Text of a Word, PowerPoint or Excel file; null for anything else. */
export function officeText(name: string, bytes: Uint8Array): string | null {
	if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
	if (/\.(docx|docm|dotx)$/i.test(name)) return wordText(bytes);
	if (/\.(pptx|pptm|potx)$/i.test(name)) return slidesText(bytes);
	if (/\.(xlsx|xlsm|xltx)$/i.test(name)) return sheetsText(bytes);
	return null;
}

/** An uploaded file: Word, PowerPoint and Excel files, CSV, HTML and plain text are read. */
async function uploadedText(entry: DriveEntry): Promise<string> {
	const name = entry.path.split("/").pop() ?? "";
	if (MEDIA.test(name)) return "";
	const res = await download(`https://drive.google.com/uc?export=download&id=${entry.id}`);
	// Drive answers files too big to virus-scan with a warning page instead.
	if (res.headers.get("content-type")?.startsWith("text/html")) {
		await res.body?.cancel();
		throw new Error("too large to read");
	}
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) return officeText(name, bytes) ?? "";
	if (bytes[0] === 0x25 && bytes[1] === 0x50) return ""; // %PDF
	const text = new TextDecoder().decode(bytes);
	if (/\.html?$/i.test(name)) return htmlText(text);
	return /\.(csv|tsv|txt|md|json)$/i.test(name) ? tidy(text) : "";
}

/** A file's text; empty for files that have none (images, videos, PDFs). */
export async function readEntry(entry: DriveEntry): Promise<string> {
	switch (entry.kind) {
		case "document":
			return exportedText(`https://docs.google.com/document/d/${entry.id}/export?format=txt`);
		case "presentation":
			return exportedText(`https://docs.google.com/presentation/d/${entry.id}/export/txt`);
		case "spreadsheets": {
			const res = await download(`https://docs.google.com/spreadsheets/d/${entry.id}/export?format=xlsx`);
			if (res.headers.get("content-type")?.startsWith("text/html")) throw new Error("not shared publicly");
			return sheetsText(new Uint8Array(await res.arrayBuffer()));
		}
		case "forms":
			return formText(entry.id);
		case "file":
			return uploadedText(entry);
	}
}
