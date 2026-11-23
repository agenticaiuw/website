import { error, text } from '@sveltejs/kit';
import { addDays, formatDate, formatTimeRange, isDate, todayIn } from '$lib/dates';
import { all, loadViewer, MEETING_SELECT, teamNames } from '$lib/server/db';
import { canSeeMeeting } from '$lib/perm';
import type { Member, MeetingRow, Viewer } from '$lib/types';
import type { RequestHandler } from './$types';

/** How a Discord name is written on a profile: "@name", "name#1234", "name (Nick)". */
const handle = (s: string) => s.trim().toLowerCase().replace(/^@/, '').replace(/\s*\(.*\)$/, '').replace(/#\d{1,4}$/, '');

/**
 * Badger's view of the hub's meetings and events, for the person who asked it in Discord: the
 * meetings they would see in the hub. Badger sends the asker's Discord names and whether their
 * Discord role is an exec one; the hub matches the names to the roster. Someone not on the roster
 * sees club events only. Signed with the token the two share, BADGER_TOKEN.
 */
export const GET: RequestHandler = async ({ url, request, locals: { env } }) => {
	if (!env.BADGER_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.BADGER_TOKEN}`) error(401, 'Not signed');
	const today = todayIn(env.TIMEZONE);
	const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from')! : today;
	const to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to')! : addDays(from, 13);
	if (to < from || to > addDays(from, 92)) error(400, 'Pick at most three months, with to on or after from.');

	const names = new Set((url.searchParams.get('discord') ?? '').split(',').map(handle).filter(Boolean));
	const member = names.size
		? (await all<Member>(env.DB, `SELECT * FROM members WHERE active = 1 AND discord <> ''`)).find((m) => names.has(handle(m.discord)))
		: undefined;
	const viewer: Viewer | null = member ? await loadViewer(env.DB, member) : null;
	const exec = viewer?.role === 'exec' || (!viewer && url.searchParams.get('exec') === '1');

	const meetings = await all<MeetingRow>(env.DB, `${MEETING_SELECT} WHERE m.date BETWEEN ? AND ? ORDER BY m.date, m.time, m.id`, from, to);
	const listed = new Set<number>();
	if (viewer) {
		const rows = await all<{ meeting_id: number }>(
			env.DB,
			`SELECT meeting_id FROM attendance WHERE member_id = ?1 UNION SELECT meeting_id FROM meeting_invites WHERE member_id = ?1`,
			viewer.id
		);
		for (const r of rows) listed.add(r.meeting_id);
	}
	const shown = meetings.filter((m) => exec || (viewer ? canSeeMeeting(viewer, m, listed.has(m.id)) : m.kind === 'event'));

	const teams = viewer
		? (await all<{ name: string }>(env.DB, `SELECT t.name FROM team_members x JOIN teams t ON t.id = x.team_id WHERE x.member_id = ? AND t.archived = 0 ORDER BY t.name`, viewer.id)).map((t) => t.name)
		: [];
	const who = viewer
		? `${viewer.name} (on the hub roster${viewer.role === 'exec' ? ' as an exec' : ''}; teams: ${teams.join(', ') || 'none'})`
		: exec
			? 'an exec (by Discord role; their Discord name is not on any hub profile)'
			: `someone whose Discord name is not on any hub profile, so only club events are shown. Their team's meetings appear once they add their Discord username to their hub profile`;
	const lines = shown.map((m) => {
		const when = formatTimeRange(m.time, m.end_time) || 'time not set';
		const where = m.location ? ` at ${m.location}` : '';
		const host = m.host_name ? `; hosted by ${m.host_name}` : '';
		return `- ${formatDate(m.date, today)} (${m.date}), ${when}: ${m.title} [${m.kind === 'event' ? 'club event' : `${teamNames(m)} team`}]${where}${host}`;
	});
	const body = [
		`Meetings and events in the hub from ${from} to ${to}, as seen by ${who}. Today in club time (${env.TIMEZONE}) is ${formatDate(today)} (${today}).`,
		lines.length ? lines.join('\n') : 'None in these dates.'
	].join('\n\n');
	return text(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
