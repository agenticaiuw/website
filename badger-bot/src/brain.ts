import { DurableObject } from "cloudflare:workers";
import type { AgentSkill } from "./agent-skills.ts";
import { DiscordApiError, type DiscordMessage, fetchBotId, getChannelMessages, sentAt, snowflakeAt } from "./discord.ts";
import { nextRunAfter } from "./schedule.ts";
import { runJob } from "./scheduled-task.ts";

export function brain(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.BRAIN as DurableObjectNamespace<Brain>;
	return namespace.get(namespace.idFromName("default"));
}

const MAX_MEMORIES = 1_000;
const MAX_RULES = 30;
const MAX_JOBS = 50;
const JOBS_PER_ALARM = 10;
/** Sessions kept (every answer: what was asked, looked up and said); the oldest go past this. */
const MAX_TRACES = 20_000;
/** How a channel read shows each message's ID, at the end of its line. */
const READ_MESSAGE_ID = /\(id (\d{15,25})\)/g;
/** What's left of a looked-up line or file whose message was deleted in Discord. */
const DELETED = "[deleted in Discord]";

// Type aliases, not interfaces: SQL rows must be indexable records.
export type MemoryRow = {
	id: number;
	text: string;
	/** The channel it was learned in; only people who can see it get it back. */
	source_channel: string;
	exec_only: number;
	saved_by_id: string;
	saved_by_name: string;
	saved_at: number;
};

/** A standing instruction an exec gave the bot (stored in the "skills" table, its old name). */
export type RuleRow = {
	name: string;
	instructions: string;
	exec_only: number;
	saved_by_name: string;
	saved_at: number;
};

export type JobRow = {
	id: number;
	guild_id: string;
	channel_id: string;
	channel_name: string;
	/** "message" posts `content`; "task" has the bot write the post from `content` each time. */
	kind: "message" | "task";
	content: string;
	allow_pings: number;
	/** A cron expression or a local date and time; see schedule.ts. */
	schedule: string;
	next_run_at: number;
	created_by_id: string;
	created_by_name: string;
	created_at: number;
	runs: number;
	last_run_at: number | null;
	last_result: string | null;
};

/** What one answer was asked, looked up and said. */
export interface AnswerTrace {
	asker: string;
	access: "exec" | "member";
	question: string;
	/** The conversation the model was given: how many turns and characters. */
	context: { turns: number; characters: number; promptCharacters: number };
	calls: Array<{ tool: string; args: string; output: string; ms: number }>;
	answer: string;
	seconds: number;
	/** The message answered and the bot's reply messages (missing on sessions saved before deletions were tracked). */
	mentionId?: string;
	answerIds?: string[];
	/** Set once an older session was checked against Discord without finding its messages. */
	checked?: boolean;
}

type TraceRow = { id: number; at: number; channel_id: string; data: string };

/** How long before its session was saved an answer's question may have been asked. */
const ANSWER_WINDOW_MS = 20 * 60_000;

const asked = (m: DiscordMessage) => m.content.replace(/<@[!&]?\d+>/g, "").trim().slice(0, 4_000);
const opening = (text: string) => text.trim().slice(0, 80);

/**
 * An older session's question and answer in Discord: their IDs, "gone" if
 * either was deleted, or null if it can't tell (a busy channel, no access).
 */
async function findOldSession(
	token: string,
	botId: string,
	row: TraceRow,
	data: AnswerTrace,
): Promise<{ mentionId: string; answerIds: string[] } | "gone" | null> {
	let near: DiscordMessage[];
	try {
		near = await getChannelMessages(token, row.channel_id, 100, snowflakeAt(row.at + 60_000));
	} catch (error) {
		// A deleted channel took its messages with it.
		return error instanceof DiscordApiError && error.status === 404 ? "gone" : null;
	}
	const from = row.at - ANSWER_WINDOW_MS;
	const sawWholeWindow = near.length < 100 || sentAt(near[near.length - 1].id) <= from;
	const recent = near.filter((m) => sentAt(m.id) >= from);
	const answer = recent.find((m) => m.author.id === botId && m.message_reference?.message_id && opening(m.content) === opening(data.answer));
	const question =
		answer?.referenced_message ?? (data.question ? recent.find((m) => m.author.id !== botId && asked(m) === data.question) : undefined);
	if (answer && question) {
		// A long answer goes out as several messages; only the first is a reply.
		const rest = recent.filter((m) => m.author.id === botId && !m.message_reference && BigInt(m.id) > BigInt(answer.id) && sentAt(m.id) - sentAt(answer.id) < 30_000);
		return { mentionId: question.id, answerIds: [answer.id, ...rest.map((m) => m.id)] };
	}
	return sawWholeWindow ? "gone" : null;
}

export type NewJob = Pick<
	JobRow,
	"guild_id" | "channel_id" | "channel_name" | "kind" | "content" | "allow_pings" | "schedule" | "next_run_at" | "created_by_id" | "created_by_name"
>;

/**
 * The bot's long-term state, shared across channels: memories it chose to
 * keep, rules execs gave it, the index of agent skills installed in its VM,
 * traces of recent answers (for the dashboard), and scheduled posts (run on
 * this object's alarm).
 */
export class Brain extends DurableObject<Env> {
	private sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.sql.exec(`CREATE TABLE IF NOT EXISTS memories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text TEXT NOT NULL,
			source_channel TEXT NOT NULL,
			exec_only INTEGER NOT NULL,
			saved_by_id TEXT NOT NULL,
			saved_by_name TEXT NOT NULL,
			saved_at INTEGER NOT NULL
		)`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS skills (
			name TEXT PRIMARY KEY,
			instructions TEXT NOT NULL,
			exec_only INTEGER NOT NULL,
			saved_by_name TEXT NOT NULL,
			saved_at INTEGER NOT NULL
		)`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_skills (
			dir TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL,
			body TEXT NOT NULL,
			files TEXT NOT NULL
		)`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS traces (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			at INTEGER NOT NULL,
			channel_id TEXT NOT NULL,
			data TEXT NOT NULL
		)`);
		// Which stored things copy which Discord messages, so deleting a message deletes its copies.
		// kind: "session" (it asked or answered), "session-read" (a session looked it up), "memory" (saved in reply to it).
		this.sql.exec(`CREATE TABLE IF NOT EXISTS message_links (
			message_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			ref INTEGER NOT NULL,
			PRIMARY KEY (message_id, kind, ref)
		)`);
		this.sql.exec("CREATE INDEX IF NOT EXISTS message_links_ref ON message_links (kind, ref)");
		this.sql.exec(`CREATE TABLE IF NOT EXISTS quiet_channels (
			channel_id TEXT PRIMARY KEY,
			set_by_name TEXT NOT NULL,
			set_at INTEGER NOT NULL
		)`);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL,
			channel_id TEXT NOT NULL,
			channel_name TEXT NOT NULL,
			kind TEXT NOT NULL,
			content TEXT NOT NULL,
			allow_pings INTEGER NOT NULL,
			schedule TEXT NOT NULL,
			next_run_at INTEGER NOT NULL,
			created_by_id TEXT NOT NULL,
			created_by_name TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			runs INTEGER NOT NULL DEFAULT 0,
			last_run_at INTEGER,
			last_result TEXT
		)`);
	}

	// -- Memories -------------------------------------------------------------

	async memories(): Promise<MemoryRow[]> {
		return this.sql.exec<MemoryRow>("SELECT * FROM memories ORDER BY saved_at DESC").toArray();
	}

	/** `fromMessage`: the message it was saved in reply to; deleting that message deletes the memory. */
	async saveMemory(memory: Omit<MemoryRow, "id" | "saved_at">, fromMessage?: string): Promise<number | string> {
		const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM memories").one().n;
		if (count >= MAX_MEMORIES) return `memory is full (${MAX_MEMORIES}); forget something old first`;
		const id = this.sql
			.exec<{ id: number }>(
				"INSERT INTO memories (text, source_channel, exec_only, saved_by_id, saved_by_name, saved_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
				memory.text,
				memory.source_channel,
				memory.exec_only,
				memory.saved_by_id,
				memory.saved_by_name,
				Date.now(),
			)
			.one().id;
		if (fromMessage) this.link(fromMessage, "memory", id);
		return id;
	}

	async updateMemory(id: number, text: string, fromMessage?: string): Promise<void> {
		this.sql.exec("UPDATE memories SET text = ?, saved_at = ? WHERE id = ?", text, Date.now(), id);
		if (fromMessage) this.link(fromMessage, "memory", id);
	}

	async forgetMemory(id: number): Promise<void> {
		this.sql.exec("DELETE FROM memories WHERE id = ?", id);
		this.sql.exec("DELETE FROM message_links WHERE kind = 'memory' AND ref = ?", id);
	}

	// -- Rules ----------------------------------------------------------------

	async rules(): Promise<RuleRow[]> {
		return this.sql.exec<RuleRow>("SELECT * FROM skills ORDER BY name").toArray();
	}

	async saveRule(skill: Omit<RuleRow, "saved_at">): Promise<string | null> {
		const exists = this.sql.exec("SELECT 1 FROM skills WHERE name = ?", skill.name).toArray().length > 0;
		const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM skills").one().n;
		if (!exists && count >= MAX_RULES) return `there are already ${MAX_RULES} rules; delete one first`;
		this.sql.exec(
			`INSERT INTO skills (name, instructions, exec_only, saved_by_name, saved_at) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(name) DO UPDATE SET instructions = excluded.instructions, exec_only = excluded.exec_only,
				saved_by_name = excluded.saved_by_name, saved_at = excluded.saved_at`,
			skill.name,
			skill.instructions,
			skill.exec_only,
			skill.saved_by_name,
			Date.now(),
		);
		return null;
	}

	async deleteRule(name: string): Promise<boolean> {
		return this.sql.exec("DELETE FROM skills WHERE name = ? RETURNING name", name).toArray().length > 0;
	}

	// -- Agent skills (an index of what's in the VM's /workspace/skills) -----

	async agentSkills(): Promise<AgentSkill[]> {
		return this.sql
			.exec<{ dir: string; name: string; description: string; body: string; files: string }>("SELECT * FROM agent_skills ORDER BY name")
			.toArray()
			.map((row) => ({ ...row, files: JSON.parse(row.files) as string[] }));
	}

	async setAgentSkills(skills: AgentSkill[]): Promise<void> {
		this.ctx.storage.transactionSync(() => {
			this.sql.exec("DELETE FROM agent_skills");
			for (const skill of skills) {
				this.sql.exec(
					"INSERT OR REPLACE INTO agent_skills (dir, name, description, body, files) VALUES (?, ?, ?, ?, ?)",
					skill.dir,
					skill.name,
					skill.description,
					skill.body,
					JSON.stringify(skill.files),
				);
			}
		});
	}

	// -- Answer traces (what each answer looked up), for the dashboard -------

	async addTrace(channelId: string, data: AnswerTrace): Promise<void> {
		const id = this.sql
			.exec<{ id: number }>("INSERT INTO traces (at, channel_id, data) VALUES (?, ?, ?) RETURNING id", Date.now(), channelId, JSON.stringify(data))
			.one().id;
		this.linkSession(id, data);
		this.sql.exec("DELETE FROM traces WHERE id <= ?", id - MAX_TRACES);
		this.sql.exec("DELETE FROM message_links WHERE kind IN ('session', 'session-read') AND ref <= ?", id - MAX_TRACES);
	}

	async traces(limit = 100): Promise<Array<{ id: number; at: number; channel_id: string; data: AnswerTrace }>> {
		return this.sql
			.exec<{ id: number; at: number; channel_id: string; data: string }>("SELECT * FROM traces ORDER BY id DESC LIMIT ?", limit)
			.toArray()
			.map((row) => ({ ...row, data: JSON.parse(row.data) as AnswerTrace }));
	}

	/** Sessions newest first, optionally matching words in the question or answer (the caller filters by channel). */
	async sessions(query = "", limit = 200): Promise<Array<{ id: number; at: number; channel_id: string; data: AnswerTrace }>> {
		const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
		const where = words.map(() => "lower(data) LIKE ?").join(" AND ");
		return this.sql
			.exec<{ id: number; at: number; channel_id: string; data: string }>(
				`SELECT * FROM traces ${where ? `WHERE ${where}` : ""} ORDER BY id DESC LIMIT ?`,
				...words.map((w) => `%${w}%`),
				limit,
			)
			.toArray()
			.map((row) => ({ ...row, data: JSON.parse(row.data) as AnswerTrace }));
	}

	async session(id: number): Promise<{ id: number; at: number; channel_id: string; data: AnswerTrace } | null> {
		const row = this.sql.exec<{ id: number; at: number; channel_id: string; data: string }>("SELECT * FROM traces WHERE id = ?", id).toArray()[0];
		return row ? { ...row, data: JSON.parse(row.data) as AnswerTrace } : null;
	}

	// -- Deleted messages: forget every copy ----------------------------------

	private link(messageId: string, kind: "session" | "session-read" | "memory", ref: number): void {
		this.sql.exec("INSERT OR IGNORE INTO message_links (message_id, kind, ref) VALUES (?, ?, ?)", messageId, kind, ref);
	}

	/** Links a session to the messages it asked and answered, and to the ones it read. */
	private linkSession(id: number, data: AnswerTrace): void {
		for (const messageId of [data.mentionId, ...(data.answerIds ?? [])]) if (messageId) this.link(messageId, "session", id);
		for (const call of data.calls) for (const match of call.output.matchAll(READ_MESSAGE_ID)) this.link(match[1], "session-read", id);
	}

	private linked(kind: string, messageIds: Iterable<string>): number[] {
		return this.sql
			.exec<{ ref: number }>(
				"SELECT DISTINCT ref FROM message_links WHERE kind = ? AND message_id IN (SELECT value FROM json_each(?))",
				kind,
				JSON.stringify([...messageIds]),
			)
			.toArray()
			.map((row) => row.ref);
	}

	/** Rewrites one session's stored data; `edit` says whether it changed anything. */
	private editSession(id: number, edit: (data: AnswerTrace) => boolean): void {
		const row = this.sql.exec<{ data: string }>("SELECT data FROM traces WHERE id = ?", id).toArray()[0];
		if (!row) return;
		const data = JSON.parse(row.data) as AnswerTrace;
		if (edit(data)) this.sql.exec("UPDATE traces SET data = ? WHERE id = ?", JSON.stringify(data), id);
	}

	/**
	 * Messages were deleted in Discord. Deletes the sessions that asked or
	 * answered them and memories saved in those conversations, and blanks the
	 * lines other sessions read from them (and their copies of what's deleted).
	 */
	async forget(messageIds: string[], questionsOfDeletedAnswers: string[] = []): Promise<{ sessions: number; memories: number; redacted: number }> {
		// A deleted question takes its answer's session and memories with it, and the reverse.
		const conversation = new Set([...messageIds, ...questionsOfDeletedAnswers]);
		const sessions = this.linked("session", conversation);
		for (const id of sessions) {
			const row = this.sql.exec<{ data: string }>("SELECT data FROM traces WHERE id = ?", id).toArray()[0];
			const data = row ? (JSON.parse(row.data) as AnswerTrace) : null;
			for (const messageId of [data?.mentionId, ...(data?.answerIds ?? [])]) if (messageId) conversation.add(messageId);
		}
		const memories = this.linked("memory", conversation);
		const read = this.linked("session-read", messageIds).filter((id) => !sessions.includes(id));
		this.removeSessions(sessions);
		for (const id of memories) await this.forgetMemory(id);
		this.removeCopies("memory", memories);
		for (const id of read) {
			this.editSession(id, (data) => {
				let changed = false;
				for (const call of data.calls) {
					const lines = call.output.split("\n");
					const kept = lines.map((line) => (messageIds.some((m) => line.includes(`(id ${m})`)) ? DELETED : line));
					if (kept.some((line, i) => line !== lines[i])) {
						call.output = kept.join("\n");
						changed = true;
					}
				}
				return changed;
			});
		}
		this.sql.exec(
			"DELETE FROM message_links WHERE kind = 'session-read' AND message_id IN (SELECT value FROM json_each(?))",
			JSON.stringify(messageIds),
		);
		return { sessions: sessions.length, memories: memories.length, redacted: read.length };
	}

	private removeSessions(ids: number[]): void {
		if (!ids.length) return;
		const list = JSON.stringify(ids);
		this.sql.exec("DELETE FROM traces WHERE id IN (SELECT value FROM json_each(?))", list);
		this.sql.exec("DELETE FROM message_links WHERE kind IN ('session', 'session-read') AND ref IN (SELECT value FROM json_each(?))", list);
		this.removeCopies("sessions", ids);
	}

	/** Blanks what other sessions looked up from deleted /sessions or /memory files. */
	private removeCopies(folder: "sessions" | "memory", ids: number[]): void {
		if (!ids.length) return;
		const gone = new Set(ids.map(String));
		const opened = new RegExp(`/${folder}/(\\d+)`);
		for (const { id } of this.sql.exec<{ id: number }>("SELECT id FROM traces WHERE data LIKE ?", `%/${folder}%`).toArray()) {
			this.editSession(id, (data) => {
				let changed = false;
				for (const call of data.calls) {
					if (!call.args.includes(`/${folder}`)) continue;
					const file = opened.exec(call.args)?.[1];
					if (file) {
						if (gone.has(file) && call.output !== DELETED) {
							call.output = DELETED;
							changed = true;
						}
						continue;
					}
					// A listing: one "<id>.md  …" line per file.
					const lines = call.output.split("\n");
					const kept = lines.filter((line) => !gone.has(/^(\d+)\.md\s/.exec(line)?.[1] ?? ""));
					if (kept.length < lines.length) {
						call.output = kept.join("\n");
						changed = true;
					}
				}
				return changed;
			});
		}
	}

	/**
	 * Sessions saved before deletions were tracked don't know their Discord
	 * messages. Each is matched to its answer and question around when it was
	 * saved: linked if both are still there, deleted if either is gone. Runs a
	 * batch at a time from the cron until every one is checked.
	 */
	async linkOldSessions(batch = 50): Promise<{ linked: number; removed: number; unsure: number; left: number } | null> {
		if (await this.ctx.storage.get<boolean>("old_sessions_linked")) return null;
		const unlinked = "json_extract(data, '$.mentionId') IS NULL AND json_extract(data, '$.checked') IS NULL";
		const token = this.env.DISCORD_BOT_TOKEN;
		const botId = await fetchBotId(token);
		const removed: number[] = [];
		let linked = 0;
		let unsure = 0;
		for (const row of this.sql.exec<TraceRow>(`SELECT * FROM traces WHERE ${unlinked} ORDER BY id LIMIT ?`, batch).toArray()) {
			const data = JSON.parse(row.data) as AnswerTrace;
			const found = await findOldSession(token, botId, row, data);
			if (found === "gone") {
				removed.push(row.id);
				continue;
			}
			if (found) {
				data.mentionId = found.mentionId;
				data.answerIds = found.answerIds;
				linked++;
			} else {
				data.checked = true;
				unsure++;
			}
			this.sql.exec("UPDATE traces SET data = ? WHERE id = ?", JSON.stringify(data), row.id);
			this.linkSession(row.id, data);
		}
		this.removeSessions(removed);
		const left = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM traces WHERE ${unlinked}`).one().n;
		if (!left) await this.ctx.storage.put("old_sessions_linked", true);
		return { linked, removed: removed.length, unsure, left };
	}

	// -- Quiet channels (where the bot answers no one) -------------------------

	async quietChannels(): Promise<Array<{ channel_id: string; set_by_name: string; set_at: number }>> {
		return this.sql.exec<{ channel_id: string; set_by_name: string; set_at: number }>("SELECT * FROM quiet_channels ORDER BY set_at").toArray();
	}

	async setQuiet(channelId: string, quiet: boolean, byName: string): Promise<void> {
		if (quiet) this.sql.exec("INSERT OR REPLACE INTO quiet_channels (channel_id, set_by_name, set_at) VALUES (?, ?, ?)", channelId, byName, Date.now());
		else this.sql.exec("DELETE FROM quiet_channels WHERE channel_id = ?", channelId);
	}

	// -- Scheduled posts ------------------------------------------------------

	async jobs(): Promise<JobRow[]> {
		return this.sql.exec<JobRow>("SELECT * FROM jobs ORDER BY next_run_at").toArray();
	}

	async addJob(job: NewJob): Promise<number | string> {
		const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM jobs").one().n;
		if (count >= MAX_JOBS) return `there are already ${MAX_JOBS} scheduled posts; cancel one first`;
		const id = this.sql
			.exec<{ id: number }>(
				`INSERT INTO jobs (guild_id, channel_id, channel_name, kind, content, allow_pings, schedule, next_run_at, created_by_id, created_by_name, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
				job.guild_id,
				job.channel_id,
				job.channel_name,
				job.kind,
				job.content,
				job.allow_pings,
				job.schedule,
				job.next_run_at,
				job.created_by_id,
				job.created_by_name,
				Date.now(),
			)
			.one().id;
		await this.scheduleAlarm();
		return id;
	}

	async cancelJob(id: number): Promise<boolean> {
		const removed = this.sql.exec("DELETE FROM jobs WHERE id = ? RETURNING id", id).toArray().length > 0;
		await this.scheduleAlarm();
		return removed;
	}

	private async scheduleAlarm(): Promise<void> {
		const next = this.sql.exec<{ at: number | null }>("SELECT MIN(next_run_at) AS at FROM jobs").one().at;
		if (next === null) await this.ctx.storage.deleteAlarm();
		else await this.ctx.storage.setAlarm(next);
	}

	async alarm(): Promise<void> {
		const due = this.sql.exec<JobRow>("SELECT * FROM jobs WHERE next_run_at <= ? ORDER BY next_run_at LIMIT ?", Date.now(), JOBS_PER_ALARM).toArray();
		for (const job of due) {
			let result: string;
			try {
				result = await runJob(this.env, job);
			} catch (error) {
				result = `failed: ${error instanceof Error ? error.message : String(error)}`;
			}
			console.log("scheduled post", { job: job.id, result });
			const next = nextRunAfter(job.schedule, new Date(Math.max(Date.now(), job.next_run_at)));
			if (next) {
				this.sql.exec(
					"UPDATE jobs SET next_run_at = ?, runs = runs + 1, last_run_at = ?, last_result = ? WHERE id = ?",
					next.getTime(),
					Date.now(),
					result,
					job.id,
				);
			} else {
				this.sql.exec("DELETE FROM jobs WHERE id = ?", job.id);
			}
		}
		await this.scheduleAlarm();
	}
}
