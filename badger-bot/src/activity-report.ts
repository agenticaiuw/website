// Member activity as plain numbers, computed in code with no model involved:
// for the /activity slash command and the dashboard.
import { activity } from "./activity.ts";
import { canSee, serverView } from "./channel-reader.ts";
import { fetchAllMembers } from "./discord.ts";

export interface ActivityRow {
	userId: string;
	name: string;
	week: number;
	month: number;
	lastAt: number;
	/** Top channels the viewer can see, with counts. */
	channels: Array<{ name: string; count: number }>;
}

export interface ActivityReport {
	rows: ActivityRow[];
	/** Members with no messages counted (when the Server Members Intent is on). */
	quiet: string[];
	countingSince: number | null;
	scanFinished: boolean;
}

/** Everyone's activity, with channel breakdowns limited to channels the viewer can see. */
export async function activityReport(env: Env, viewer: { userId: string; roles: string[]; guildId: string }): Promise<ActivityReport> {
	const [summary, view, members] = await Promise.all([
		activity(env).summary(),
		serverView(env.DISCORD_BOT_TOKEN, viewer.guildId),
		fetchAllMembers(env.DISCORD_BOT_TOKEN, viewer.guildId).catch(() => null),
	]);
	const rows = summary.people.map((p) => ({
		userId: p.userId,
		name: p.name,
		week: p.week,
		month: p.month,
		lastAt: p.lastAt,
		channels: p.channels
			.filter((c) => canSee(view, viewer.userId, viewer.roles, c.channelId))
			.slice(0, 3)
			.map((c) => ({ name: view.channels.find((ch) => ch.id === c.channelId)?.name ?? "thread", count: c.count })),
	}));
	const counted = new Set(rows.map((r) => r.userId));
	const quiet = (members ?? []).filter((m) => !m.user.bot && !counted.has(m.user.id)).map((m) => m.nick || m.user.global_name || m.user.username);
	return { rows, quiet, countingSince: summary.countingSince, scanFinished: summary.scanFinished };
}

function shortDay(ms: number): string {
	if (!ms) return "—";
	const days = Math.floor((Date.now() - ms) / 86_400_000);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	return new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}

/** A Discord message (at most 2,000 characters): a leaderboard, or one person's detail. */
export function formatActivity(report: ActivityReport, focusUserId?: string): string {
	const since = report.countingSince
		? new Date(report.countingSince).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })
		: "now";
	const note = `Counting since ${since}${report.scanFinished ? "" : " (still scanning history)"}.`;
	if (focusUserId) {
		const row = report.rows.find((r) => r.userId === focusUserId);
		if (!row) return `No messages counted for <@${focusUserId}> in the last 30 days. ${note}`;
		const where = row.channels.map((c) => `#${c.name} (${c.count})`).join(", ");
		return `**${row.name}**: ${row.week} messages this week, ${row.month} in 30 days, last seen ${shortDay(row.lastAt)}.${where ? ` Mostly in ${where}.` : ""}\n-# ${note}`;
	}
	const width = Math.min(18, Math.max(4, ...report.rows.map((r) => r.name.length)));
	const pad = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text.padEnd(n));
	const header = `${pad("Name", width)}  7d   30d  last seen`;
	const lines: string[] = [];
	let shown = 0;
	for (const r of report.rows) {
		const line = `${pad(r.name, width)} ${String(r.week).padStart(3)} ${String(r.month).padStart(5)}  ${shortDay(r.lastAt)}`;
		if ([header, ...lines, line].join("\n").length > 1_500) break;
		lines.push(line);
		shown++;
	}
	const more = report.rows.length - shown;
	let quiet = report.quiet.length ? `\nNo messages counted: ${report.quiet.join(", ")}` : "";
	if (quiet.length > 300) quiet = `\nNo messages counted: ${report.quiet.length} members`;
	return `**Activity, most active first**\n\`\`\`\n${header}\n${lines.join("\n") || "(nobody yet)"}\n\`\`\`${more > 0 ? `…and ${more} more (the dashboard has everyone).` : ""}${quiet}\n-# ${note}`;
}
