import { DurableObject } from "cloudflare:workers";
import { type DiscordChannel, PERMISSIONS, channelPermissions, fetchBotId, fetchGuildChannels, fetchGuildMember, fetchGuildRoles, getChannelMessages, sentAt } from "./discord.ts";

export function activity(env: Env) {
	// The generated Env type can't see the class behind a same-Worker binding.
	const namespace = env.ACTIVITY as DurableObjectNamespace<Activity>;
	return namespace.get(namespace.idFromName("default"));
}

/** How far back the one-time history scan goes. */
const BACKFILL_DAYS = 30;
const PAGES_PER_STEP = 10;
const KEEP_DAYS = 400;
/** Text and announcement channels. */
const COUNTED_TYPES = new Set([0, 5]);

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface MemberActivity {
	userId: string;
	name: string;
	lastAt: number;
	week: number;
	month: number;
	/** Messages per channel over 30 days, most first. */
	channels: Array<{ channelId: string; count: number }>;
}

/**
 * Who talks how much, where. Messages are counted as they arrive, and the
 * last 30 days of history are scanned once (in small alarm steps) to start
 * with; the scan stops where live counting began, so nothing counts twice.
 */
export class Activity extends DurableObject<Env> {
	private sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.sql.exec(`CREATE TABLE IF NOT EXISTS counts (
			user_id TEXT NOT NULL, day TEXT NOT NULL, channel_id TEXT NOT NULL, n INTEGER NOT NULL,
			PRIMARY KEY (user_id, day, channel_id)
		)`);
		this.sql.exec("CREATE TABLE IF NOT EXISTS people (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, last_at INTEGER NOT NULL)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS scan (channel_id TEXT PRIMARY KEY, before TEXT, done INTEGER NOT NULL DEFAULT 0)");
		this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
	}

	private meta(key: string): string | undefined {
		return this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value;
	}

	private setMeta(key: string, value: string | number): void {
		this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, String(value));
	}

	private count(userId: string, name: string, channelId: string, at: number): void {
		this.sql.exec(
			"INSERT INTO counts (user_id, day, channel_id, n) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day, channel_id) DO UPDATE SET n = n + 1",
			userId,
			day(at),
			channelId,
		);
		this.sql.exec(
			`INSERT INTO people (user_id, name, last_at) VALUES (?, ?, ?)
			ON CONFLICT(user_id) DO UPDATE SET name = CASE WHEN excluded.last_at >= last_at THEN excluded.name ELSE name END,
				last_at = MAX(last_at, excluded.last_at)`,
			userId,
			name,
			at,
		);
	}

	/** A message just arrived. */
	async record(userId: string, name: string, channelId: string, at: number): Promise<void> {
		if (!this.meta("live_since")) this.setMeta("live_since", at);
		this.count(userId, name, channelId, at);
	}

	/** Starts the one-time history scan if it hasn't run (called by the cron). */
	async ensureScanned(): Promise<void> {
		if (this.meta("scan_started")) return;
		const token = this.env.DISCORD_BOT_TOKEN;
		const guildId = this.env.CLUB_GUILD_ID;
		const botId = await fetchBotId(token);
		const [channels, roles, me] = await Promise.all([fetchGuildChannels(token, guildId), fetchGuildRoles(token, guildId), fetchGuildMember(token, guildId, botId)]);
		const readable = channels.filter((c: DiscordChannel) => {
			const p = channelPermissions(guildId, botId, me.roles, roles, c);
			return COUNTED_TYPES.has(c.type) && (p & PERMISSIONS.VIEW_CHANNEL) !== 0n && (p & PERMISSIONS.READ_MESSAGE_HISTORY) !== 0n;
		});
		const now = Date.now();
		if (!this.meta("live_since")) this.setMeta("live_since", now);
		// Scan backwards from where live counting began.
		const start = String((BigInt(Number(this.meta("live_since")) - 1420070400000) << 22n));
		for (const channel of readable) this.sql.exec("INSERT OR IGNORE INTO scan (channel_id, before, done) VALUES (?, ?, 0)", channel.id, start);
		this.setMeta("scan_started", now);
		await this.ctx.storage.setAlarm(now);
		console.log("activity scan started", { channels: readable.length });
	}

	async alarm(): Promise<void> {
		const token = this.env.DISCORD_BOT_TOKEN;
		const oldest = Date.now() - BACKFILL_DAYS * 86_400_000;
		let pages = 0;
		for (const row of this.sql.exec<{ channel_id: string; before: string }>("SELECT channel_id, before FROM scan WHERE done = 0").toArray()) {
			let before = row.before;
			let done = false;
			while (pages < PAGES_PER_STEP && !done) {
				pages++;
				const messages = await getChannelMessages(token, row.channel_id, 100, before).catch(() => []);
				for (const m of messages) {
					const at = sentAt(m.id);
					if (at < oldest) {
						done = true;
						continue;
					}
					if (!m.author.bot) this.count(m.author.id, m.author.global_name || m.author.username, row.channel_id, at);
				}
				if (messages.length < 100) done = true;
				else before = messages[messages.length - 1].id;
			}
			this.sql.exec("UPDATE scan SET before = ?, done = ? WHERE channel_id = ?", before, done ? 1 : 0, row.channel_id);
			if (pages >= PAGES_PER_STEP) break;
		}
		const left = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM scan WHERE done = 0").one().n;
		if (left) await this.ctx.storage.setAlarm(Date.now() + 1_000);
		else {
			this.setMeta("scan_finished", Date.now());
			this.sql.exec("DELETE FROM counts WHERE day < ?", day(Date.now() - KEEP_DAYS * 86_400_000));
			console.log("activity scan finished");
		}
	}

	/** Activity per person over the last 7 and 30 days, most active first. */
	async summary(): Promise<{ people: MemberActivity[]; countingSince: number | null; scanFinished: boolean }> {
		const now = Date.now();
		const rows = this.sql
			.exec<{ user_id: string; day: string; channel_id: string; n: number }>("SELECT * FROM counts WHERE day >= ?", day(now - 30 * 86_400_000))
			.toArray();
		const people = new Map(this.sql.exec<{ user_id: string; name: string; last_at: number }>("SELECT * FROM people").toArray().map((p) => [p.user_id, p]));
		const byUser = new Map<string, MemberActivity>();
		const weekStart = day(now - 7 * 86_400_000);
		for (const row of rows) {
			const person = people.get(row.user_id);
			const entry = byUser.get(row.user_id) ?? { userId: row.user_id, name: person?.name ?? row.user_id, lastAt: person?.last_at ?? 0, week: 0, month: 0, channels: [] };
			entry.month += row.n;
			if (row.day >= weekStart) entry.week += row.n;
			const channel = entry.channels.find((c) => c.channelId === row.channel_id);
			if (channel) channel.count += row.n;
			else entry.channels.push({ channelId: row.channel_id, count: row.n });
			byUser.set(row.user_id, entry);
		}
		// People seen before, but quiet for 30 days.
		for (const person of people.values()) {
			if (!byUser.has(person.user_id)) byUser.set(person.user_id, { userId: person.user_id, name: person.name, lastAt: person.last_at, week: 0, month: 0, channels: [] });
		}
		for (const entry of byUser.values()) entry.channels.sort((a, b) => b.count - a.count);
		const live = this.meta("live_since");
		return {
			people: [...byUser.values()].sort((a, b) => b.month - a.month || b.lastAt - a.lastAt),
			countingSince: live ? Number(live) - BACKFILL_DAYS * 86_400_000 : null,
			scanFinished: Boolean(this.meta("scan_finished")),
		};
	}

	/** Messages per day over 30 days for one person. */
	async daily(userId: string): Promise<Array<{ day: string; n: number }>> {
		return this.sql
			.exec<{ day: string; n: number }>("SELECT day, SUM(n) AS n FROM counts WHERE user_id = ? AND day >= ? GROUP BY day ORDER BY day", userId, day(Date.now() - 30 * 86_400_000))
			.toArray();
	}
}
