import { redirect } from '@sveltejs/kit';
import { addDays, formatDate, isDate, todayIn } from '$lib/dates';
import type { MeetingListRow } from '$lib/meetings';
import { isExec } from '$lib/perm';
import { all, meetingById, MEETING_VISIBLE, teams, visible } from '$lib/server/db';
import { readForm, str } from '$lib/server/form';
import { invitesAndSkips, LIST_SELECT, readMeeting, repeatDates, runnerFor, setTeams, setWho } from '$lib/server/meetings';
import { announceMeeting, notifyHost } from '$lib/server/reminders';
import type { Actions, PageServerLoad } from './$types';

/** Upcoming shows this many days; anything later (mostly repeats) folds away. */
const SOON_DAYS = 21;

export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	const today = todayIn(env.TIMEZONE);
	const q = url.searchParams;
	const events = q.get('kind') === 'event';
	const selectedTeams = [...new Set(q.getAll('team').flatMap((value) => value.split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
	const dateMode = ['before', 'after', 'on'].includes(q.get('date_mode') ?? '') ? q.get('date_mode')! : 'on';
	const rawDate = q.get('date') ?? '';
	const date = isDate(rawDate) ? rawDate : '';
	const where = [visible(v, MEETING_VISIBLE)];
	const params: (string | number)[] = [v.id, today];
	if (events) where.push("m.kind = 'event'");
	if (selectedTeams.length) where.push(`m.id IN (SELECT meeting_id FROM meeting_teams WHERE team_id IN (SELECT value FROM json_each(?${params.push(JSON.stringify(selectedTeams))})))`);
	if (date) where.push(`m.date ${dateMode === 'before' ? '<' : dateMode === 'after' ? '>' : '='} ?${params.push(date)}`);
	const [upcoming, past, teamList] = await Promise.all([
		all<MeetingListRow>(env.DB, `${LIST_SELECT} WHERE ${where.join(' AND ')} AND m.date >= ?2 ORDER BY m.date, m.time LIMIT 300`, ...params),
		all<MeetingListRow>(env.DB, `${LIST_SELECT} WHERE ${where.join(' AND ')} AND m.date < ?2 ORDER BY m.date DESC, m.time DESC LIMIT 300`, ...params),
		teams(env.DB)
	]);
	const cutoff = addDays(today, SOON_DAYS);
	return {
		title: 'Meetings',
		active: 'meetings' as const,
		today,
		cutoff,
		events,
		selectedTeams,
		dateMode,
		date,
		soon: upcoming.filter((m) => m.date <= cutoff),
		later: upcoming.filter((m) => m.date > cutoff),
		past,
		teams: (isExec(v) ? teamList : teamList.filter((t) => v.teamIds.has(t.id) && t.kind === 'project')).map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	// A new meeting, or a series of them when it repeats.
	default: async ({ request, locals: { env, viewer: v } }) => {
		const form = await readForm(request);
		const m = readMeeting(form);
		if (m.kind === 'event') m.teamIds = [await runnerFor(env.DB, v)].filter((t) => t !== null);
		const teamId = m.teamIds[0];
		const back = `/meetings/new${m.kind === 'event' ? '?kind=event&' : '?'}error=`;
		if (!m.title) redirect(303, back + 'missing');
		if (!teamId) redirect(303, back + 'team');
		if (!isDate(m.date)) redirect(303, back + 'date');
		if (m.badTime) redirect(303, back + 'time');
		if (!isExec(v) && m.teamIds.some((t) => !v.leadOf.has(t))) redirect(303, back + 'forbidden');
		const every = Number(str(form.repeat));
		const until = str(form.until);
		if (every && (!isDate(until) || until < m.date)) redirect(303, back + 'until');
		const dates = repeatDates(m.date, every, until);

		const db = env.DB;
		const who = await invitesAndSkips(db, m, m.teamIds);
		const insert = (date: string, notes: string, seriesId: number | null) =>
			db
				.prepare('INSERT INTO meetings (team_id, kind, series_id, title, date, time, end_time, location, doc_url, agenda, notes, created_by, host_id, cohost_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
				.bind(teamId, m.kind, seriesId, m.title, date, m.time, m.endTime, m.location, m.docUrl, m.agenda, notes, v.id, m.host, m.cohost);
		const firstId = Number((await insert(m.date, m.notes, null).run()).meta.last_row_id);
		const created = 'SELECT id FROM meetings WHERE id = ?1 OR series_id = ?1';
		await db.batch([
			// Repeats copy everything but the notes, and share the first one's id.
			...(dates.length > 1 ? [db.prepare('UPDATE meetings SET series_id = ?1 WHERE id = ?1').bind(firstId), ...dates.slice(1).map((d) => insert(d, '', firstId))] : []),
			...setTeams(db, m.teamIds, created, firstId),
			...setWho(db, who, created, firstId)
		]);
		const ok = dates.length > 1 ? 'scheduled' : 'created';
		const made = await meetingById(db, firstId);
		if (made) await notifyHost(env, made, v.id);
		if (str(form.notify) !== '1') redirect(303, `/meetings/${firstId}?ok=${ok}`);

		const meeting = await meetingById(db, firstId);
		const today = todayIn(env.TIMEZONE);
		const repeats = dates.length > 1 ? `It repeats every ${every === 7 ? 'week' : '2 weeks'} until ${formatDate(dates[dates.length - 1], today)}.` : undefined;
		const result = meeting ? await announceMeeting(env, meeting, { repeats }) : { sent: 0, error: 'not found' };
		if (result.error) redirect(303, `/meetings/${firstId}?error=unsent`);
		redirect(303, `/meetings/${firstId}?ok=${!result.sent ? ok : ok === 'scheduled' ? 'scheduled-emailed' : 'emailed'}`);
	}
};
