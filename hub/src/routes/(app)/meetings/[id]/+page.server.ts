import { error, redirect } from '@sveltejs/kit';
import { addDays, daysBetween, formatDate, isDate, todayIn } from '$lib/dates';
import { meetingTeams } from '$lib/meeting-teams';
import { canEditMeeting, isExec } from '$lib/perm';
import { activeMembers, all, meetingById, nowIso, roster, TASK_SELECT } from '$lib/server/db';
import { readForm, str } from '$lib/server/form';
import { meetingTiming } from '$lib/server/meeting-content';
import { loadMeeting } from '$lib/server/meeting-access';
import {
	attendanceHistory,
	cadence,
	formForMeeting,
	invitesAndSkips,
	LATER_IN_SERIES,
	laterInSeries,
	meetingContent,
	readMeeting,
	repeatDates,
	rosterFor,
	runnerFor,
	setTeams,
	setWho,
	summaryRevisions
} from '$lib/server/meetings';
import { announceMeeting, meetingPeople, notifyHost } from '$lib/server/reminders';
import { MEETING_SOON_HOURS, reminderTimes, remindKey } from '$lib/server/schedule';
import type { Member, TaskRow } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const VIEWS = ['preparation', 'follow-up', 'form', 'attendance', 'library'] as const;
type MeetingView = (typeof VIEWS)[number];

export const load: PageServerLoad = async ({ params, url, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const db = env.DB;
	const zone = env.TIMEZONE;
	const today = todayIn(zone);
	const editable = canEditMeeting(v, m);
	const [rosterRows, actions, people, toRemind, form, content, attendance, summary, series] = await Promise.all([
		rosterFor(db, m),
		all<TaskRow>(db, `${TASK_SELECT} WHERE t.meeting_id = ? ORDER BY t.status = 'open' DESC, t.due_date, a.name`, m.id),
		editable ? activeMembers(db) : Promise.resolve([] as Member[]),
		editable && m.date >= today ? meetingPeople(db, m) : Promise.resolve([] as Member[]),
		formForMeeting(db, m.id),
		meetingContent(db, m.id),
		attendanceHistory(db, m, v),
		summaryRevisions(db, m.id),
		editable ? laterInSeries(db, m) : Promise.resolve([])
	]);
	// Its two reminders (a day before, an hour before): which are still to come, and whether one went out.
	const remindAt = reminderTimes(m, MEETING_SOON_HOURS, zone);
	const remindKeyNow = remindKey(m);
	const remindAhead = [m.reminded_day_for !== remindKeyNow && remindAt.day, m.reminded_soon_for !== remindKeyNow && remindAt.soon].filter(
		(t): t is number => typeof t === 'number' && t > Date.now()
	);
	const roster_ = rosterRows.map(({ id, name, email, status, self_report }) => ({ id, name, email, status, self_report }));
	const timing = meetingTiming(m, zone);
	const view = url.searchParams.get('view') as MeetingView | null;
	const myAttendance = roster_.find((r) => r.id === v.id);
	return {
		title: m.title,
		active: 'meetings' as const,
		m,
		today,
		zone,
		appUrl: env.APP_URL,
		editable,
		roster: roster_,
		actions,
		people: roster(people),
		others: roster(people.filter((p) => !roster_.some((r) => r.id === p.id))),
		toRemind: toRemind.length,
		reminded: m.reminded_day_for === remindKeyNow || m.reminded_soon_for === remindKeyNow,
		remindAhead,
		form,
		content,
		attendance: {
			history: attendance.history.map(({ id, title, date }) => ({ id, title, date })),
			rows: attendance.rows,
			expected: attendance.expected,
			kind: m.kind,
			// Columns for meetings that haven't started yet don't count anyone as absent.
			started: attendance.history.filter((h) => meetingTiming(h, zone).started).map((h) => h.id)
		},
		summary,
		seriesLeft: series.length,
		ended: timing.ended,
		selectedView: (view && VIEWS.includes(view) ? view : timing.ended ? 'follow-up' : 'preparation') as MeetingView,
		defaultDue: addDays(m.date > today ? m.date : today, 7),
		canCheckIn: timing.started && !timing.ended && (m.kind === 'event' || !!myAttendance) && (!myAttendance?.status || myAttendance.self_report === 1),
		myStatus: myAttendance?.status ?? null
	};
};

export const actions: Actions = {
	// Saves the meeting, and the rest of its series when "this and later" is picked.
	default: async ({ params, request, locals: { env, viewer: v } }) => {
		const existing = await loadMeeting(env, v, params.id);
		if (!existing || !canEditMeeting(v, existing)) error(404, 'Not found');
		const form = await readForm(request);
		const m = readMeeting(form);
		if (m.kind === 'event') m.teamIds = [await runnerFor(env.DB, v, existing)].filter((t) => t !== null);
		// The main team stays the same while it's still picked.
		const teamId = m.teamIds.includes(existing.team_id) ? existing.team_id : m.teamIds[0];
		const edit = `/meetings/${existing.id}/edit?error=`;
		if (!m.title) redirect(303, edit + 'missing');
		if (!teamId) redirect(303, edit + 'team');
		if (!isDate(m.date)) redirect(303, edit + 'date');
		if (m.badTime) redirect(303, edit + 'time');
		// A new date or time for an upcoming meeting needs a reason, which goes in the email.
		const retimed = m.date !== existing.date || m.time !== existing.time || m.endTime !== existing.end_time;
		const reason = str(form.reason, 300);
		if (retimed && existing.date >= todayIn(env.TIMEZONE) && !reason) redirect(303, edit + 'reason-change');
		// Leads can add only teams they lead; teams already on it can stay.
		const before = new Set(meetingTeams(existing).map((t) => t.id));
		if (!isExec(v) && m.teamIds.some((t) => !before.has(t) && !v.leadOf.has(t))) redirect(303, edit + 'forbidden');
		const db = env.DB;
		const now = nowIso();
		const who = await invitesAndSkips(db, m, m.teamIds);
		const wasOn = new Set((await meetingPeople(db, existing)).map((p) => p.id));
		const stmts = [
			db
				.prepare('UPDATE meetings SET kind = ?, team_id = ?, title = ?, date = ?, time = ?, end_time = ?, location = ?, doc_url = ?, agenda = ?, notes = ?, host_id = ?, cohost_id = ?, updated_at = ? WHERE id = ?')
				.bind(m.kind, teamId, m.title, m.date, m.time, m.endTime, m.location, m.docUrl, m.agenda, m.notes, m.host, m.cohost, now, existing.id),
			...setTeams(db, m.teamIds, '?1', existing.id),
			...setWho(db, who, '?1', existing.id)
		];
		// "This and later" (or a one-off that now repeats): the later dates follow this one's new date,
		// cadence and end. Existing later meetings keep their pages, agendas and notes and are re-dated in
		// order; extra dates get new meetings, and ones past the new end are deleted.
		const later = await laterInSeries(db, existing);
		const every = Number(str(form.repeat));
		const scope = later.length ? str(form.series) === '1' : every > 0;
		let dates: string[] = [];
		if (scope) {
			let until = str(form.until);
			// An untouched end date moves with the meeting, so moving Thursdays to Sundays keeps them all.
			if (until && until === str(form.until_was)) until = addDays(until, daysBetween(existing.date, m.date));
			if (!isDate(until) || until < m.date) redirect(303, edit + 'until');
			dates = repeatDates(m.date, every || cadence(existing.date, later), until).slice(1);
			const seriesId = existing.series_id ?? existing.id;
			if (!existing.series_id) stmts.push(db.prepare('UPDATE meetings SET series_id = ?1 WHERE id = ?1').bind(existing.id));
			const update = db.prepare('UPDATE meetings SET kind = ?, team_id = ?, title = ?, date = ?, time = ?, end_time = ?, location = ?, doc_url = ?, host_id = ?, cohost_id = ?, updated_at = ? WHERE id = ?');
			later.forEach((o, i) => {
				if (i < dates.length) stmts.push(update.bind(m.kind, teamId, m.title, dates[i], m.time, m.endTime, m.location, m.docUrl, m.host, m.cohost, now, o.id));
				else stmts.push(db.prepare('DELETE FROM meetings WHERE id = ?').bind(o.id));
			});
			const insert = db.prepare('INSERT INTO meetings (team_id, kind, series_id, title, date, time, end_time, location, doc_url, agenda, notes, created_by, host_id, cohost_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
			for (const d of dates.slice(later.length)) stmts.push(insert.bind(teamId, m.kind, seriesId, m.title, d, m.time, m.endTime, m.location, m.docUrl, m.agenda, '', v.id, m.host, m.cohost));
			// Teams and people for every later one, old and new, once they're all in place.
			await db.batch(stmts);
			stmts.length = 0;
			const rest = [`SELECT id ${LATER_IN_SERIES}`, seriesId, m.date, teamId] as const;
			stmts.push(...setTeams(db, m.teamIds, ...rest), ...setWho(db, who, ...rest));
		}
		if (stmts.length) await db.batch(stmts);
		const meeting = await meetingById(db, existing.id);
		if (meeting) await notifyHost(env, meeting, v.id, [existing.host_id, existing.cohost_id]);
		if (str(form.notify) !== '1' || !meeting) redirect(303, `/meetings/${existing.id}?ok=saved`);
		// A new date, time, place or series goes to everyone on it; otherwise only people just added hear about it.
		const changes = {
			date: m.date !== existing.date,
			time: m.time !== existing.time || m.endTime !== existing.end_time,
			place: m.location !== existing.location,
			repeating: scope && dates.length > 0 && !later.length,
			laterDates: scope && later.length > 0 && (dates.length !== later.length || dates.some((d, i) => d !== later[i].date))
		};
		const moved = changes.date || changes.time || changes.place || changes.repeating;
		const added = (await meetingPeople(db, meeting)).map((p) => p.id).filter((p) => !wasOn.has(p));
		const today = todayIn(env.TIMEZONE);
		const repeats = scope && dates.length ? `It repeats every ${(every || cadence(existing.date, later)) === 14 ? '2 weeks' : 'week'} until ${formatDate(dates[dates.length - 1], today)}.` : undefined;
		const result =
			moved || changes.laterDates
				? await announceMeeting(env, meeting, { mode: 'changed', changes, repeats, why: reason ? { reason, by: v.name } : undefined })
				: added.length
					? await announceMeeting(env, meeting, { mode: 'added', repeats, only: added })
					: { sent: 0, error: '' };
		if (result.error) redirect(303, `/meetings/${existing.id}?error=unsent`);
		redirect(303, `/meetings/${existing.id}?ok=${result.sent ? 'saved-emailed' : 'saved'}`);
	}
};
