import { DurableObject } from "cloudflare:workers";
import type { Access } from "./access.ts";
import { chatgptPlan } from "./chatgpt-plan.ts";
import { type DriveEntry, type DriveKind, readEntry, walkDrive } from "./drive.ts";
import { handbookInstructions, notesInstructions, parseNotes } from "./drive-notes.ts";
import { ChatGPTError, askChatGPT } from "./openai.ts";

export function clubDrive(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.CLUB_DRIVE as DurableObjectNamespace<ClubDrive>;
	return namespace.get(namespace.idFromName("default"));
}

/** How often the Drive is checked for changes. */
const SYNC_EVERY_MS = 60 * 60_000;
/** After a failed step, wait this long before trying again. */
const RETRY_AFTER_MS = 15 * 60_000;
const READS_PER_STEP = 3;
const NOTES_PER_STEP = 3;
/** Files with less text than this have nothing worth noting. */
const MIN_TEXT_CHARS = 40;
/** File text the model reads when writing a file's member notes. */
const MAX_NOTES_INPUT_CHARS = 40_000;
/** Notes the model can't write after this many tries are skipped until the file changes. */
const MAX_NOTE_FAILURES = 3;
const MAX_HANDBOOK_CHARS = 16_000;
/** File text returned to an exec's read_drive_file call. */
const MAX_READ_CHARS = 60_000;
/** An exec reading a Google Doc, Sheet or Slides gets a fresh copy if the saved one is older. */
const FRESH_FOR_MS = 5 * 60_000;
/** Judging what members may know deserves more thought than a chat reply. */
const NOTES_EFFORT = "medium";
const MODEL_TIMEOUT_MS = 4 * 60_000;

// A type alias, not an interface: SQL rows must be indexable records.
type FileRow = {
	id: string;
	path: string;
	kind: DriveKind;
	url: string;
	modified: string;
	needs_read: number;
	text: string | null;
	hash: string | null;
	error: string | null;
	read_at: number | null;
	description: string | null;
	member_notes: string | null;
	notes_hash: string | null;
	note_failures: number;
};

const KIND_LABELS: Record<DriveKind, string> = {
	document: "Google Doc",
	spreadsheets: "Google Sheet",
	presentation: "Google Slides",
	forms: "Google Form",
	file: "uploaded file",
};

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function today(): string {
	return new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric" });
}

/**
 * The club's shared Google Drive, kept in two tiers. Execs' questions can
 * read any file. Everyone else is answered from a member handbook the model
 * writes from each file's member-safe notes, so exec-only details never reach
 * a member's answer, however the question is phrased.
 *
 * Syncing runs in small steps on alarms (list, read changed files, write
 * their notes, rebuild the handbook) and repeats hourly.
 */
export class ClubDrive extends DurableObject<Env> {
	private sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.sql.exec(`CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			kind TEXT NOT NULL,
			url TEXT NOT NULL,
			modified TEXT NOT NULL,
			needs_read INTEGER NOT NULL DEFAULT 1,
			text TEXT,
			hash TEXT,
			error TEXT,
			read_at INTEGER,
			description TEXT,
			member_notes TEXT,
			notes_hash TEXT,
			note_failures INTEGER NOT NULL DEFAULT 0
		)`);
		this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
	}

	private meta(key: string): string | undefined {
		return this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value;
	}

	private setMeta(key: string, value: string | number): void {
		this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, String(value));
	}

	/** Starts syncing if it isn't scheduled (called by the Worker's cron). */
	async keepSyncing(): Promise<void> {
		if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now());
	}

	/** Progress counts for /status; no file names or contents. */
	async status() {
		const counts = this.sql
			.exec<{ files: number; unread: number; unreadable: number; notes_pending: number; with_notes: number }>(
				`SELECT COUNT(*) AS files,
					SUM(needs_read) AS unread,
					SUM(error IS NOT NULL AND text IS NULL) AS unreadable,
					SUM(text IS NOT NULL AND (notes_hash IS NULL OR notes_hash != hash) AND note_failures < ${MAX_NOTE_FAILURES}) AS notes_pending,
					SUM(member_notes != '') AS with_notes
				FROM files`,
			)
			.one();
		const listedAt = Number(this.meta("listed_at") ?? 0);
		const handbookAt = Number(this.meta("handbook_at") ?? 0);
		return {
			...counts,
			listedAt: listedAt ? new Date(listedAt).toISOString() : null,
			handbookAt: handbookAt ? new Date(handbookAt).toISOString() : null,
			handbookCharacters: (this.meta("handbook") ?? "").length,
		};
	}

	/** What the bot may draw on: the member handbook, plus the file index for execs. */
	async knowledge(access: Access): Promise<{ handbook: string; index: string }> {
		const handbook = this.meta("handbook") ?? "";
		if (access !== "exec") return { handbook, index: "" };
		const rows = this.sql
			.exec<Pick<FileRow, "id" | "path" | "kind" | "url" | "modified" | "description" | "error"> & { chars: number | null }>(
				"SELECT id, path, kind, url, modified, description, error, length(text) AS chars FROM files ORDER BY path",
			)
			.toArray();
		const index = rows
			.map((row) => {
				const parts = [row.id, row.path, `${KIND_LABELS[row.kind]}, modified ${row.modified}`, row.url];
				if (row.description) parts.push(row.description);
				if (!row.chars) parts.push(row.error ? `(couldn't be read: ${row.error})` : "(no text: an image, video or PDF)");
				return `- ${parts.join(" | ")}`;
			})
			.join("\n");
		return { handbook, index };
	}

	/** Every file, for /drive (execs only; the caller checks). */
	async files(): Promise<Array<{ id: string; path: string; kind: string; modified: string; description: string | null; readable: number }>> {
		return this.sql
			.exec<{ id: string; path: string; kind: string; modified: string; description: string | null; readable: number }>(
				"SELECT id, path, kind, modified, description, (length(text) > 0) AS readable FROM files ORDER BY path",
			)
			.toArray();
	}

	/** A file's full text, for execs only (the caller checks). */
	async readFile(id: string): Promise<string> {
		const row = this.sql.exec<FileRow>("SELECT * FROM files WHERE id = ?", id).toArray()[0];
		if (!row) return "There's no file with that ID. Use an ID from the drive index.";
		let text = row.text ?? "";
		if (row.kind !== "file" && row.kind !== "forms" && Date.now() - (row.read_at ?? 0) > FRESH_FOR_MS) {
			text = await readEntry(row).catch(() => text);
		}
		const header = `File: ${row.path}\nLink: ${row.url}\nLast modified: ${row.modified}`;
		if (!text) return `${header}\n\n(No readable text: ${row.error ?? "it's an image, video or PDF"}.)`;
		const truncated = text.length > MAX_READ_CHARS ? `\n\n[Cut off after ${MAX_READ_CHARS} of ${text.length} characters.]` : "";
		return `${header}\n\n${text.slice(0, MAX_READ_CHARS)}${truncated}`;
	}

	async alarm(): Promise<void> {
		let next: number;
		try {
			next = await this.step();
		} catch (error) {
			console.error("drive sync step failed", error);
			next = Date.now() + RETRY_AFTER_MS;
		}
		await this.ctx.storage.setAlarm(next);
	}

	/** Does one bounded piece of syncing and returns when to do the next. */
	private async step(): Promise<number> {
		const now = Date.now();
		const listedAt = Number(this.meta("listed_at") ?? 0);
		if (now - listedAt >= SYNC_EVERY_MS) {
			await this.list();
			return now;
		}
		const unread = this.sql.exec<FileRow>("SELECT * FROM files WHERE needs_read = 1 LIMIT ?", READS_PER_STEP).toArray();
		if (unread.length) {
			await Promise.all(unread.map((row) => this.read(row)));
			return now;
		}
		const stale = this.sql
			.exec<FileRow>(
				"SELECT * FROM files WHERE text IS NOT NULL AND (notes_hash IS NULL OR notes_hash != hash) AND note_failures < ? LIMIT ?",
				MAX_NOTE_FAILURES,
				NOTES_PER_STEP,
			)
			.toArray();
		if (stale.length) return (await this.writeNotes(stale)) ? now : now + RETRY_AFTER_MS;
		const source = await this.handbookSource();
		if (source.fingerprint !== this.meta("handbook_source")) {
			await this.writeHandbook(source.text, source.files);
			this.setMeta("handbook_source", source.fingerprint);
			return now;
		}
		return listedAt + SYNC_EVERY_MS;
	}

	/** Lists the Drive and marks new, changed, moved and unreadable files for reading. */
	private async list(): Promise<void> {
		const entries = await walkDrive(this.env.DRIVE_FOLDER_ID);
		const known = new Map(
			this.sql
				.exec<Pick<FileRow, "id" | "path" | "modified" | "error">>("SELECT id, path, modified, error FROM files")
				.toArray()
				.map((row) => [row.id, row]),
		);
		// An empty listing more likely means Drive's page changed than that everything was deleted.
		if (!entries.length && known.size) throw new Error("the Drive listing came back empty");
		let changed = 0;
		for (const entry of entries) {
			const row = known.get(entry.id);
			const needsRead = !row || row.modified !== entry.modified || row.path !== entry.path || row.error !== null;
			if (needsRead) changed++;
			this.sql.exec(
				`INSERT INTO files (id, path, kind, url, modified, needs_read) VALUES (?, ?, ?, ?, ?, 1)
				ON CONFLICT(id) DO UPDATE SET path = excluded.path, kind = excluded.kind, url = excluded.url,
					modified = excluded.modified, needs_read = MAX(files.needs_read, ?)`,
				entry.id,
				entry.path,
				entry.kind,
				entry.url,
				entry.modified,
				needsRead ? 1 : 0,
			);
		}
		const listed = new Set(entries.map((entry) => entry.id));
		const removed = [...known.keys()].filter((id) => !listed.has(id));
		for (const id of removed) this.sql.exec("DELETE FROM files WHERE id = ?", id);
		this.setMeta("listed_at", Date.now());
		console.log("drive listed", { files: entries.length, changed, removed: removed.length });
	}

	private async read(row: FileRow): Promise<void> {
		try {
			const text = await readEntry(row as DriveEntry);
			// The path is part of what the notes judge (an Executive folder means something).
			const hash = await sha256(`${row.path}\n${text}`);
			const empty = text.length < MIN_TEXT_CHARS;
			// Right-hand sides see the row as it was, so `hash = ?` compares with the old hash.
			this.sql.exec(
				`UPDATE files SET note_failures = CASE WHEN hash = ? THEN note_failures ELSE 0 END,
					text = ?, hash = ?, error = NULL, read_at = ?, needs_read = 0
				WHERE id = ?`,
				hash,
				text,
				hash,
				Date.now(),
				row.id,
			);
			// Nothing to note in an image, video or near-empty file.
			if (empty) this.sql.exec("UPDATE files SET member_notes = '', description = NULL, notes_hash = hash WHERE id = ?", row.id);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			// Keep any earlier text; the next listing tries again.
			this.sql.exec("UPDATE files SET error = ?, needs_read = 0, read_at = ? WHERE id = ?", reason, Date.now(), row.id);
			console.log("drive file unreadable", { path: row.path, reason });
		}
	}

	/** Has the model write each file's member-safe notes. Returns false if any failed. */
	private async writeNotes(rows: FileRow[]): Promise<boolean> {
		const accessToken = await chatgptPlan(this.env).getAccessToken();
		const results = await Promise.allSettled(
			rows.map(async (row) => {
				const text = row.text ?? "";
				const reply = await askChatGPT({
					usageGate: chatgptPlan(this.env),
					accessToken,
					model: this.env.OPENAI_MODEL,
					reasoningEffort: NOTES_EFFORT,
					instructions: notesInstructions(),
					turns: [
						{
							role: "user",
							text: `File: ${row.path}\nType: ${KIND_LABELS[row.kind]}\nLast modified: ${row.modified}\nLink: ${row.url}\n\n${text.slice(0, MAX_NOTES_INPUT_CHARS)}${text.length > MAX_NOTES_INPUT_CHARS ? "\n[Cut off here.]" : ""}`,
						},
					],
					webSearch: false,
					timeoutMs: MODEL_TIMEOUT_MS,
				});
				const { description, notes } = parseNotes(reply);
				this.sql.exec(
					"UPDATE files SET description = ?, member_notes = ?, notes_hash = ?, note_failures = 0 WHERE id = ? AND hash = ?",
					description,
					notes,
					row.hash,
					row.id,
					row.hash,
				);
				console.log("drive notes", { path: row.path, characters: notes.length });
			}),
		);
		results.forEach((result, i) => {
			if (result.status === "fulfilled") return;
			const row = rows[i];
			console.error("drive notes failed", { path: row.path, error: String(result.reason) });
			if (result.reason instanceof ChatGPTError && ["subscription_sharing_usage_limit_exceeded", "usage_backoff"].includes(result.reason.code)) return;
			this.sql.exec("UPDATE files SET note_failures = note_failures + 1 WHERE id = ?", row.id);
		});
		return results.every((result) => result.status === "fulfilled");
	}

	/** The member notes the handbook is built from, and a fingerprint to tell when they change. */
	private async handbookSource(): Promise<{ text: string; files: number; fingerprint: string }> {
		const rows = this.sql
			.exec<Pick<FileRow, "path" | "modified" | "member_notes">>(
				"SELECT path, modified, member_notes FROM files WHERE member_notes != '' ORDER BY path",
			)
			.toArray();
		const text = rows.map((row) => `## From ${row.path} (last modified ${row.modified})\n${row.member_notes}`).join("\n\n");
		return { text, files: rows.length, fingerprint: await sha256(text) };
	}

	private async writeHandbook(notes: string, files: number): Promise<void> {
		let handbook = "";
		if (notes) {
			handbook = await askChatGPT({
				usageGate: chatgptPlan(this.env),
				accessToken: await chatgptPlan(this.env).getAccessToken(),
				model: this.env.OPENAI_MODEL,
				reasoningEffort: NOTES_EFFORT,
				instructions: handbookInstructions(today()),
				turns: [{ role: "user", text: notes }],
				webSearch: false,
				timeoutMs: MODEL_TIMEOUT_MS,
			});
			if (!handbook) throw new Error("the model wrote an empty handbook");
		}
		this.setMeta("handbook", handbook.slice(0, MAX_HANDBOOK_CHARS));
		this.setMeta("handbook_at", Date.now());
		console.log("drive handbook updated", { files, characters: handbook.length });
		// Member-safe by construction; logged so leads can review what members can learn.
		console.log("drive handbook", handbook);
	}
}
