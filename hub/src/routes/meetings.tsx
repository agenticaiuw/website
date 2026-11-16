import { Hono } from 'hono';
import { addDays, daysBetween, formatDate, formatTime, formatTimeRange, hourIn, isDate, isTime, todayIn } from '../dates';
import { activeMembers, all, first, MEETING_EXPECTED, MEETING_SELECT, MEETING_TEAMS_JSON, MEETING_VISIBLE, meetingById, meetingTeams, nowIso, run, TASK_SELECT, teamNames, teams, teamsByMember, visible } from '../db';
import { meetingEmail } from '../emails';
import { id, isHttpUrl, list, readForm, str } from '../form';
import { meetingTiming } from '../meeting-content';
import { canAssign, canEditMeeting, canSeeMeeting, isExec, teamsFor } from '../perm';
import { announceCanceled, announceMeeting, emailMeeting, meetingPeople, notifyAssigned, notifyHost } from '../reminders';
import { meetingReminderAt } from '../schedule';
import type { AppEnv, AttendanceStatus, Member, MeetingKind, MeetingRow, TaskRow, Viewer } from '../types';
import { page } from '../views/layout';
import { Choice, Empty, Field, Markdown, MemberSelect, netIds, PageHead, PeoplePicker, PersonName, PostButton, Tabs, TaskList } from '../views/ui';
import { FormSection, formForMeeting } from './forms';
import { loadMeeting } from './meeting-access';
import { MeetingAgenda, MeetingFiles, meetingContent } from './meeting-content';
import { MeetingSummary, summaryRevisions } from './meeting-summary';
import { createTasks } from './tasks';

export const meetingRoutes = new Hono<AppEnv>();

const STATUSES: [AttendanceStatus, string][] = [
	['present', 'Present'],
	['late', 'Late'],
	['excused', 'Excused'],
	['absent', 'Absent']
];

type MeetingListRow = MeetingRow & { present: number; marked: number; actions: number; open_actions: number };

const LIST_SELECT = `
	SELECT m.*, tm.name AS team_name, tm.kind AS team_kind, (SELECT name FROM members WHERE id = m.host_id) AS host_name, ${MEETING_TEAMS_JSON},
		(SELECT COUNT(*) FROM attendance x WHERE x.meeting_id = m.id AND x.status IN ('present', 'late')) AS present,
		(SELECT COUNT(*) FROM attendance x WHERE x.meeting_id = m.id) AS marked,
		(SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id) AS actions,
		(SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id AND t.status = 'open') AS open_actions
	FROM meetings m JOIN teams tm ON tm.id = m.team_id`;

/** Upcoming shows this many days; anything later (mostly repeats) folds away. */
const SOON_DAYS = 21;

meetingRoutes.get('/meetings', async (c) => {
	const v = c.get('viewer');
	const today = todayIn(c.env.TIMEZONE);
	const events = c.req.query('kind') === 'event';
	const selectedTeams = [...new Set((c.req.queries('team') ?? []).flatMap((value) => value.split(',')).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
	const dateMode = ['before', 'after', 'on'].includes(c.req.query('date_mode') ?? '') ? c.req.query('date_mode')! : 'on';
	const rawDate = c.req.query('date') ?? '';
	const date = isDate(rawDate) ? rawDate : '';
	const where = [visible(v, MEETING_VISIBLE)];
	const params: (string | number)[] = [v.id, today];
	if (events) where.push("m.kind = 'event'");
	if (selectedTeams.length) where.push(`m.id IN (SELECT meeting_id FROM meeting_teams WHERE team_id IN (SELECT value FROM json_each(?${params.push(JSON.stringify(selectedTeams))})))`);
	if (date) where.push(`m.date ${dateMode === 'before' ? '<' : dateMode === 'after' ? '>' : '='} ?${params.push(date)}`);
	const [upcoming, past, teamList] = await Promise.all([
		all<MeetingListRow>(c.env.DB, `${LIST_SELECT} WHERE ${where.join(' AND ')} AND m.date >= ?2 ORDER BY m.date, m.time LIMIT 300`, ...params),
		all<MeetingListRow>(c.env.DB, `${LIST_SELECT} WHERE ${where.join(' AND ')} AND m.date < ?2 ORDER BY m.date DESC, m.time DESC LIMIT 300`, ...params),
		teams(c.env.DB)
	]);
	const cutoff = addDays(today, SOON_DAYS);
	const soon = upcoming.filter((m) => m.date <= cutoff);
	const later = upcoming.filter((m) => m.date > cutoff);
	const visibleTeams = isExec(v) ? teamList : teamList.filter((t) => v.teamIds.has(t.id) && t.kind === 'project');

	const attendance = (m: MeetingListRow) => {
		if (!m.marked) return <span class="muted">Not taken</span>;
		return m.kind === 'event' ? `${m.present} came` : `${m.present}/${m.marked} present`;
	};
	// Upcoming rows say where; past rows say who came and what came of it.
	const table = (rows: MeetingListRow[], ahead: boolean) => (
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Date</th>
						<th>Meeting</th>
						<th>Team</th>
						{ahead ? (
							<th>Where</th>
						) : (
							<>
								<th>Attendance</th>
								<th>Action items</th>
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{rows.map((m) => (
						<tr>
							<td class="nowrap">
								{formatDate(m.date, today)}
								{m.time && <small class="muted"> {formatTimeRange(m.time, m.end_time)}</small>}
							</td>
							<td>
								<a href={`/meetings/${m.id}`}>{m.title}</a>
								{m.kind === 'event' && <span class="tag event">Club event</span>}
							</td>
							<td class="team-tags">
								{meetingTeams(m).map((t) => (
									<span class={`tag ${t.kind}`}>{t.name}</span>
								))}
							</td>
							{ahead ? (
								<td class="clip">{m.location || <span class="muted">—</span>}</td>
							) : (
								<>
									<td>{attendance(m)}</td>
									<td>{m.actions ? `${m.actions - m.open_actions}/${m.actions} done` : <span class="muted">None</span>}</td>
								</>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);

	return page(
		c,
		{ title: 'Meetings', active: 'meetings' },
		<>
			<PageHead
				title="Meetings"
				sub="Team meetings and club events: who came, what was discussed, and what everyone agreed to do."
				actions={
					canAssign(v) && (
						<>
							<a class="btn" href="/meetings/new?kind=event">
								New event
							</a>
							<a class="btn primary" href="/meetings/new">
								New meeting
							</a>
						</>
					)
				}
			/>
			<div class="toolbar">
				<form method="get" action="/meetings" class="meeting-team-filter" data-meeting-filters>
					<div class="seg" aria-label="Meeting type">
						<label><input type="radio" name="kind" value="" checked={!events} /><span>All</span></label>
						<label><input type="radio" name="kind" value="event" checked={events} /><span>Club events</span></label>
					</div>
					<details class="menu team-filter-menu">
						<summary class="btn" data-team-filter-label>{selectedTeams.length ? `Teams (${selectedTeams.length})` : 'All teams'} ▾</summary>
						<div class="menu-panel team-filter-panel" aria-label="Filter by teams">
							{visibleTeams.map((t) => <label class="check"><input type="checkbox" name="team" value={String(t.id)} checked={selectedTeams.includes(t.id)} /><span>{t.name}</span></label>)}
						</div>
					</details>
					<label class="sr-only" for="meeting-date-mode">Date comparison</label>
					<select id="meeting-date-mode" name="date_mode" aria-label="Date comparison">
						<option value="before" selected={dateMode === 'before'}>Before</option><option value="after" selected={dateMode === 'after'}>After</option><option value="on" selected={dateMode === 'on'}>On</option>
					</select>
					<input type="date" name="date" value={date} aria-label="Meeting date" />
					<noscript><button class="btn small">Apply filters</button></noscript>
				</form>
			</div>
			<div id="meeting-filter-results" aria-live="polite">
			<h2 class="section-title">Upcoming</h2>
			{soon.length ? table(soon, true) : <Empty>{later.length ? 'Nothing in the next three weeks.' : 'Nothing scheduled.'}</Empty>}
			{later.length > 0 && (
				<details class="more">
					<summary>
						{later.length} more after {formatDate(cutoff, today)}
					</summary>
					{table(later, true)}
				</details>
			)}
			<h2 class="section-title">Past</h2>
			{past.length ? table(past, false) : <Empty>None yet.</Empty>}
			</div>
		</>
	);
});

// ---------- create / edit ----------

const REPEATS: [string, string][] = [
	['0', 'Doesn’t repeat'],
	['7', 'Weekly'],
	['14', 'Every 2 weeks']
];
/** Most dates one repeating meeting can create, so a typo in the end date can't make hundreds. */
const MAX_REPEATS = 30;

function MeetingForm({ v, teamList, people, picked, teamsOf, m, kind, action, today, later = 0, every = 7, last }: { v: Viewer; teamList: { id: number; name: string }[]; people: Member[]; picked: Set<number>; teamsOf: Map<number, number[]>; m?: MeetingRow; kind: MeetingKind; action: string; today: string; later?: number; every?: number; last?: string }) {
	const until = last ?? addDays(m?.date ?? today, 63);
	const club = (m?.kind ?? kind) === 'event';
	const pickedTeams = new Set(club ? [] : m ? meetingTeams(m).map((t) => t.id) : [teamList[0]?.id]);
	return (
		<form method="post" action={action} class="card form-grid">
			<PeoplePicker
				label="Who’s it for"
				hint="Tick a team to add everyone on it, then untick anyone who doesn’t need to come. Everyone ticked sees it, is on its attendance and gets the reminder. Pick more than one team for a joint meeting. Whole club makes it a club event open to everyone."
				teams={teamList}
				club={club}
				pickedTeams={pickedTeams}
				people={people}
				picked={picked}
				teamsOf={teamsOf}
				personName="person"
			/>
			<Field label="Title" wide>
				<input name="title" required maxlength={200} value={m?.title ?? ''} placeholder={kind === 'event' ? 'e.g. General meeting' : 'e.g. Weekly standup'} />
			</Field>
			<Field label="Host" hint="Who’s responsible for running it. They’re emailed when it’s set.">
				<MemberSelect name="host" members={people} selected={m ? m.host_id : v.id} blank="No host yet" />
			</Field>
			<Field label="Date">
				<input type="date" name="date" required value={m?.date ?? today} />
			</Field>
			<div class="field">
				<span class="label">Time</span>
				<div class="time-range">
					<TimeSelect name="time" value={m?.time ?? ''} label="Starts" />
					<span>to</span>
					<TimeSelect name="end_time" value={m?.end_time ?? ''} label="Ends" />
				</div>
				<span class="hint">Optional</span>
			</div>
			{later > 0 && (
				<Choice
					name="series"
					label="Change"
					selected="1"
					options={[
						['1', `This and the ${later} later ${later === 1 ? 'one' : 'ones'}`],
						['0', 'Only this one']
					]}
					hint="Later ones move with this one and take its time, place, title and people. Their agendas and notes stay."
				/>
			)}
			<Choice name="repeat" label="Repeats" selected={later > 0 ? String(every) : '0'} options={later > 0 ? REPEATS.slice(1) : REPEATS} />
			<label class="field until">
				<span class="label">Until</span>
				<input type="date" name="until" value={until} />
				<input type="hidden" name="until_was" value={until} />
				<span class="hint">Up to {MAX_REPEATS} dates. Each one gets its own page for notes and attendance.</span>
			</label>
			<Field label="Location" hint="Room, Discord channel or Zoom link">
				<input name="location" maxlength={200} value={m?.location ?? ''} />
			</Field>
			<Field label="Meeting doc" hint="Optional link to the Google Doc">
				<input type="url" name="doc_url" maxlength={500} value={m?.doc_url ?? ''} placeholder="https://docs.google.com/…" />
			</Field>
			<Field label="Agenda" hint="Markdown works: - bullets, **bold**, links." wide>
				<textarea name="agenda" rows={6}>
					{m?.agenda ?? ''}
				</textarea>
			</Field>
			<Field label="Notes: what was discussed and decided" hint="Add action items on the meeting page so they become tracked tasks." wide>
				<textarea name="notes" rows={m ? 12 : 4}>
					{m?.notes ?? ''}
				</textarea>
			</Field>
			<div class="field wide">
				<label class="check">
					<input type="checkbox" name="notify" value="1" checked />
					{m ? 'Email people about the change' : 'Email everyone about it now'}
				</label>
				<span class="hint">
					{m
						? 'Everyone on it hears about a new date, time, place or series; otherwise just anyone you added. Nothing is sent for agenda or notes edits.'
						: 'One email to everyone ticked above (the whole club for a club event). The usual reminder still goes out before it.'}
				</span>
			</div>
			{m && m.date >= today && (
				// Hidden until it's needed: app.js shows it on Cancel or a new date or time.
				<label class="field wide" data-reason hidden>
					<span class="label">Reason</span>
					<input name="reason" maxlength={300} placeholder="e.g. Room’s booked, so we’re meeting Monday instead" />
					<span class="hint">It goes in the email to everyone.</span>
				</label>
			)}
			<div class="form-actions wide">
				<button class="btn primary">{m ? 'Save' : 'Create'}</button>
				<a class="btn ghost" href={m ? `/meetings/${m.id}` : '/meetings'}>
					Back
				</a>
				{m && (isExec(v) || m.created_by === v.id) && (
					<>
						<span class="spacer"></span>
						{later > 0 && (
							<button class="btn danger" formaction={`/meetings/${m.id}/delete?following=1`} formnovalidate data-needs="reason" data-confirm={`Cancel this and the ${later} after it? Everyone on them is emailed, and their pages and attendance are deleted. Action items stay as tasks.`}>
								Cancel this and later
							</button>
						)}
						{m.date >= today ? (
							<button class="btn danger" formaction={`/meetings/${m.id}/delete`} formnovalidate data-needs="reason" data-confirm="Cancel this meeting? Everyone on it is emailed, and its page and attendance are deleted. Action items stay as tasks.">
								Cancel meeting
							</button>
						) : (
							<button class="btn danger" formaction={`/meetings/${m.id}/delete`} formnovalidate data-confirm="Delete this past meeting and its attendance? No one is emailed. Action items stay as tasks.">
								Delete
							</button>
						)}
					</>
				)}
			</div>
		</form>
	);
}

function readMeeting(form: Record<string, unknown>) {
	const docUrl = str(form.doc_url, 500);
	const time = str(form.time);
	const end = str(form.end_time);
	const picked = list(form.team);
	return {
		kind: (picked.includes('club') ? 'event' : 'meeting') as MeetingKind,
		// In the order the form lists them, so the first is the main team. Whole club comes in as
		// 'club'; runnerFor fills in the team.
		teamIds: [...new Set(picked.map(Number))].filter((n) => Number.isInteger(n) && n > 0),
		title: str(form.title, 200),
		date: str(form.date),
		time: isTime(time) ? time : '',
		endTime: isTime(time) && isTime(end) ? end : '',
		// An end time that isn't after the start is a typo (meetings don't run past midnight).
		badTime: isTime(end) && (!isTime(time) || end <= time),
		location: str(form.location, 200),
		docUrl: docUrl && isHttpUrl(docUrl) ? docUrl : '',
		agenda: str(form.agenda, 50_000),
		notes: str(form.notes, 100_000),
		host: id(form.host),
		people: [...new Set(list(form.person).map(Number))].filter((n) => Number.isInteger(n) && n > 0),
		// Set by app.js once team chips tick their people, so unticked team members can be skipped.
		synced: str(form.people_synced) === '1'
	};
}

type MeetingInput = ReturnType<typeof readMeeting>;

/**
 * Splits who's ticked into invites (not on its teams) and skips (on its teams but unticked).
 * Club events are open to everyone, so neither.
 */
async function invitesAndSkips(db: D1Database, m: MeetingInput, teamIds: number[]) {
	if (m.kind === 'event') return { invites: [], skips: [] };
	const teamsOf = await teamsByMember(db);
	const onTeams = (memberId: number) => teamsOf.get(memberId)?.some((t) => teamIds.includes(t)) ?? false;
	const ticked = new Set(m.people);
	return {
		invites: m.people.filter((p) => !onTeams(p)),
		skips: m.synced ? [...teamsOf.keys()].filter((p) => onTeams(p) && !ticked.has(p)) : []
	};
}

/** Who to tick on the form: everyone for a club event, else its teams minus skips plus invites. */
async function pickedFor(db: D1Database, m: MeetingRow, teamsOf: Map<number, number[]>, people: Member[]) {
	if (m.kind === 'event') return new Set(people.map((p) => p.id));
	const [invites, skips] = await Promise.all([
		all<{ member_id: number }>(db, 'SELECT member_id FROM meeting_invites WHERE meeting_id = ?', m.id),
		all<{ member_id: number }>(db, 'SELECT member_id FROM meeting_skips WHERE meeting_id = ?', m.id)
	]);
	const teamIds = meetingTeams(m).map((t) => t.id);
	const skipped = new Set(skips.map((r) => r.member_id));
	const picked = new Set(invites.map((r) => r.member_id));
	for (const p of people) if (!skipped.has(p.id) && teamsOf.get(p.id)?.some((t) => teamIds.includes(t))) picked.add(p.id);
	return picked;
}

/** Replaces who's invited to, or skipped for, the meetings `ids` selects. `ids` uses ?1…?n for `params`. */
function setPeople(db: D1Database, table: 'meeting_invites' | 'meeting_skips', people: number[], ids: string, ...params: (string | number)[]) {
	return [
		db.prepare(`DELETE FROM ${table} WHERE meeting_id IN (${ids})`).bind(...params),
		db
			.prepare(
				`INSERT INTO ${table} (meeting_id, member_id) SELECT mt.id, j.value FROM meetings mt, json_each(?${params.length + 1}) j
				 WHERE mt.id IN (${ids}) AND j.value IN (SELECT id FROM members)`
			)
			.bind(...params, JSON.stringify(people))
	];
}

/** Invites and skips together, for the meetings `ids` selects. */
const setWho = (db: D1Database, who: { invites: number[]; skips: number[] }, ids: string, ...params: (string | number)[]) => [
	...setPeople(db, 'meeting_invites', who.invites, ids, ...params),
	...setPeople(db, 'meeting_skips', who.skips, ids, ...params)
];

/** Replaces the teams of the meetings `ids` selects. `ids` uses ?1…?n for `params`. */
function setTeams(db: D1Database, teamIds: number[], ids: string, ...params: (string | number)[]) {
	return [
		db.prepare(`DELETE FROM meeting_teams WHERE meeting_id IN (${ids})`).bind(...params),
		db
			.prepare(
				`INSERT INTO meeting_teams (meeting_id, team_id) SELECT mt.id, j.value FROM meetings mt, json_each(?${params.length + 1}) j
				 WHERE mt.id IN (${ids}) AND j.value IN (SELECT id FROM teams)`
			)
			.bind(...params, JSON.stringify(teamIds))
	];
}

/** The team behind a whole-club meeting: the one it already has, the exec team, or the team a lead runs. */
async function runnerFor(db: D1Database, v: Viewer, existing?: MeetingRow) {
	if (existing?.kind === 'event') return existing.team_id;
	if (isExec(v)) return (await first<{ id: number }>(db, "SELECT id FROM teams WHERE kind = 'exec' AND archived = 0 ORDER BY id"))?.id ?? null;
	return [...v.leadOf][0] ?? null;
}

/** The first date plus its repeats, up to and including `until`. */
function repeatDates(first: string, every: number, until: string) {
	const dates = [first];
	if (every !== 7 && every !== 14) return dates;
	for (let d = addDays(first, every); d <= until && dates.length < MAX_REPEATS; d = addDays(d, every)) dates.push(d);
	return dates;
}

meetingRoutes.get('/meetings/new', async (c) => {
	const v = c.get('viewer');
	if (!canAssign(v)) return c.redirect('/meetings?error=forbidden');
	const kind: MeetingKind = c.req.query('kind') === 'event' ? 'event' : 'meeting';
	const [allTeams, people, teamsOf] = await Promise.all([teams(c.env.DB), activeMembers(c.env.DB), teamsByMember(c.env.DB)]);
	const teamList = teamsFor(v, allTeams);
	const firstTeam = teamList[0]?.id;
	const picked = new Set(people.filter((p) => kind === 'event' || (firstTeam !== undefined && teamsOf.get(p.id)?.includes(firstTeam))).map((p) => p.id));
	const title = kind === 'event' ? 'New club event' : 'New meeting';
	return page(
		c,
		{ title, active: 'meetings' },
		<>
			<PageHead eyebrow="Meetings" title={title} sub="Set it up ahead of time or after it happens. Attendance and action items go on its page." />
			<MeetingForm v={v} teamList={teamList} people={people} picked={picked} teamsOf={teamsOf} kind={kind} action="/meetings" today={todayIn(c.env.TIMEZONE)} />
		</>
	);
});

meetingRoutes.post('/meetings', async (c) => {
	const v = c.get('viewer');
	const form = await readForm(c);
	const m = readMeeting(form);
	if (m.kind === 'event') m.teamIds = [await runnerFor(c.env.DB, v)].filter((t) => t !== null);
	const teamId = m.teamIds[0];
	const back = `/meetings/new${m.kind === 'event' ? '?kind=event&' : '?'}error=`;
	if (!m.title) return c.redirect(back + 'missing');
	if (!teamId) return c.redirect(back + 'team');
	if (!isDate(m.date)) return c.redirect(back + 'date');
	if (m.badTime) return c.redirect(back + 'time');
	if (!isExec(v) && m.teamIds.some((t) => !v.leadOf.has(t))) return c.redirect(back + 'forbidden');
	const every = Number(str(form.repeat));
	const until = str(form.until);
	if (every && (!isDate(until) || until < m.date)) return c.redirect(back + 'until');
	const dates = repeatDates(m.date, every, until);

	const db = c.env.DB;
	const who = await invitesAndSkips(db, m, m.teamIds);
	const insert = (date: string, notes: string, seriesId: number | null) =>
		db
			.prepare('INSERT INTO meetings (team_id, kind, series_id, title, date, time, end_time, location, doc_url, agenda, notes, created_by, host_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(teamId, m.kind, seriesId, m.title, date, m.time, m.endTime, m.location, m.docUrl, m.agenda, notes, v.id, m.host);
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
	if (made) await notifyHost(c.env, made, v.id);
	if (str(form.notify) !== '1') return c.redirect(`/meetings/${firstId}?ok=${ok}`);

	const meeting = await meetingById(db, firstId);
	const today = todayIn(c.env.TIMEZONE);
	const repeats = dates.length > 1 ? `It repeats every ${every === 7 ? 'week' : '2 weeks'} until ${formatDate(dates[dates.length - 1], today)}.` : undefined;
	const result = meeting ? await announceMeeting(c.env, meeting, { repeats }) : { sent: 0, error: 'not found' };
	if (result.error) return c.redirect(`/meetings/${firstId}?error=unsent`);
	return c.redirect(`/meetings/${firstId}?ok=${!result.sent ? ok : ok === 'scheduled' ? 'scheduled-emailed' : 'emailed'}`);
});

/** A plain time box: any time, to the minute. */
function TimeSelect({ name, value, label }: { name: string; value: string; label: string }) {
	return <input type="time" name={name} aria-label={label} value={isTime(value) ? value : ''} />;
}

/** Later meetings in the same series that changes to this one can carry over to. */
const LATER_IN_SERIES = 'FROM meetings WHERE series_id = ?1 AND date > ?2 AND team_id = ?3';

async function laterInSeries(db: D1Database, m: MeetingRow) {
	if (!m.series_id) return [];
	return all<{ id: number; date: string }>(db, `SELECT id, date ${LATER_IN_SERIES} ORDER BY date, id`, m.series_id, m.date, m.team_id);
}

/** How often a series repeats, from the gap to the next one: weekly unless it's two weeks. */
const cadence = (date: string, later: { date: string }[]) => (later[0] && daysBetween(date, later[0].date) === 14 ? 14 : 7);

meetingRoutes.get('/meetings/:id/edit', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	const [allTeams, series, people, teamsOf] = await Promise.all([teams(c.env.DB), laterInSeries(c.env.DB, m), activeMembers(c.env.DB), teamsByMember(c.env.DB)]);
	const later = series.length;
	const picked = await pickedFor(c.env.DB, m, teamsOf, people);
	// The meeting's own teams stay on the list, even ones this person couldn't pick for a new one.
	const teamList = [...teamsFor(v, allTeams)];
	for (const t of meetingTeams(m)) if (!teamList.some((x) => x.id === t.id)) teamList.push(allTeams.find((x) => x.id === t.id) ?? { ...t, description: '', archived: 0 });
	teamList.sort((a, b) => Number(a.kind === 'project') - Number(b.kind === 'project') || a.name.localeCompare(b.name));
	return page(
		c,
		{ title: `Edit: ${m.title}`, active: 'meetings' },
		<>
			<PageHead eyebrow={m.kind === 'event' ? 'Edit club event' : 'Edit meeting'} title={m.title} />
			<MeetingForm v={v} teamList={teamList} people={people} picked={picked} teamsOf={teamsOf} m={m} kind={m.kind} action={`/meetings/${m.id}`} today={todayIn(c.env.TIMEZONE)} later={later} every={cadence(m.date, series)} last={series.at(-1)?.date} />
		</>
	);
});

meetingRoutes.post('/meetings/:id', async (c) => {
	const v = c.get('viewer');
	const existing = await loadMeeting(c, v, c.req.param('id'));
	if (!existing || !canEditMeeting(v, existing)) return c.notFound();
	const form = await readForm(c);
	const m = readMeeting(form);
	if (m.kind === 'event') m.teamIds = [await runnerFor(c.env.DB, v, existing)].filter((t) => t !== null);
	// The main team stays the same while it's still picked.
	const teamId = m.teamIds.includes(existing.team_id) ? existing.team_id : m.teamIds[0];
	if (!m.title) return c.redirect(`/meetings/${existing.id}/edit?error=missing`);
	if (!teamId) return c.redirect(`/meetings/${existing.id}/edit?error=team`);
	if (!isDate(m.date)) return c.redirect(`/meetings/${existing.id}/edit?error=date`);
	if (m.badTime) return c.redirect(`/meetings/${existing.id}/edit?error=time`);
	// A new date or time for an upcoming meeting needs a reason, which goes in the email.
	const retimed = m.date !== existing.date || m.time !== existing.time || m.endTime !== existing.end_time;
	const reason = str(form.reason, 300);
	if (retimed && existing.date >= todayIn(c.env.TIMEZONE) && !reason) return c.redirect(`/meetings/${existing.id}/edit?error=reason-change`);
	// Leads can add only teams they lead; teams already on it can stay.
	const before = new Set(meetingTeams(existing).map((t) => t.id));
	if (!isExec(v) && m.teamIds.some((t) => !before.has(t) && !v.leadOf.has(t))) return c.redirect(`/meetings/${existing.id}/edit?error=forbidden`);
	const db = c.env.DB;
	const now = nowIso();
	const who = await invitesAndSkips(db, m, m.teamIds);
	const wasOn = new Set((await meetingPeople(db, existing)).map((p) => p.id));
	const stmts = [
		db
			.prepare('UPDATE meetings SET kind = ?, team_id = ?, title = ?, date = ?, time = ?, end_time = ?, location = ?, doc_url = ?, agenda = ?, notes = ?, host_id = ?, updated_at = ? WHERE id = ?')
			.bind(m.kind, teamId, m.title, m.date, m.time, m.endTime, m.location, m.docUrl, m.agenda, m.notes, m.host, now, existing.id),
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
		if (!isDate(until) || until < m.date) return c.redirect(`/meetings/${existing.id}/edit?error=until`);
		dates = repeatDates(m.date, every || cadence(existing.date, later), until).slice(1);
		const seriesId = existing.series_id ?? existing.id;
		if (!existing.series_id) stmts.push(db.prepare('UPDATE meetings SET series_id = ?1 WHERE id = ?1').bind(existing.id));
		const update = db.prepare('UPDATE meetings SET kind = ?, team_id = ?, title = ?, date = ?, time = ?, end_time = ?, location = ?, doc_url = ?, host_id = ?, updated_at = ? WHERE id = ?');
		later.forEach((o, i) => {
			if (i < dates.length) stmts.push(update.bind(m.kind, teamId, m.title, dates[i], m.time, m.endTime, m.location, m.docUrl, m.host, now, o.id));
			else stmts.push(db.prepare('DELETE FROM meetings WHERE id = ?').bind(o.id));
		});
		const insert = db.prepare('INSERT INTO meetings (team_id, kind, series_id, title, date, time, end_time, location, doc_url, agenda, notes, created_by, host_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
		for (const d of dates.slice(later.length)) stmts.push(insert.bind(teamId, m.kind, seriesId, m.title, d, m.time, m.endTime, m.location, m.docUrl, m.agenda, '', v.id, m.host));
		// Teams and people for every later one, old and new, once they're all in place.
		await db.batch(stmts);
		stmts.length = 0;
		const rest = [`SELECT id ${LATER_IN_SERIES}`, seriesId, m.date, teamId] as const;
		stmts.push(...setTeams(db, m.teamIds, ...rest), ...setWho(db, who, ...rest));
	}
	await db.batch(stmts);
	const meeting = await meetingById(db, existing.id);
	if (meeting && m.host !== existing.host_id) await notifyHost(c.env, meeting, v.id);
	if (str(form.notify) !== '1' || !meeting) return c.redirect(`/meetings/${existing.id}?ok=saved`);
	// A new date, time, place or series goes to everyone on it; otherwise only people just added hear about it.
	const moved = m.date !== existing.date || m.time !== existing.time || m.endTime !== existing.end_time || m.location !== existing.location || (scope && dates.length > 0 && !later.length);
	const reDated = scope && later.length > 0 && (dates.length !== later.length || dates.some((d, i) => d !== later[i].date));
	const added = (await meetingPeople(db, meeting)).map((p) => p.id).filter((p) => !wasOn.has(p));
	const today = todayIn(c.env.TIMEZONE);
	const repeats = scope && dates.length ? `It repeats every ${(every || cadence(existing.date, later)) === 14 ? '2 weeks' : 'week'} until ${formatDate(dates[dates.length - 1], today)}.` : undefined;
	const result = moved || reDated ? await announceMeeting(c.env, meeting, { mode: 'changed', repeats, why: reason ? { reason, by: v.name } : undefined }) : added.length ? await announceMeeting(c.env, meeting, { mode: 'added', repeats, only: added }) : { sent: 0, error: '' };
	if (result.error) return c.redirect(`/meetings/${existing.id}?error=unsent`);
	return c.redirect(`/meetings/${existing.id}?ok=${result.sent ? 'saved-emailed' : 'saved'}`);
});

/**
 * Cancels a meeting (or it and the rest of its series): everyone on the upcoming ones is emailed,
 * then they're deleted. Past ones are just deleted.
 */
meetingRoutes.post('/meetings/:id/delete', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !(isExec(v) || m.created_by === v.id)) return c.notFound();
	const db = c.env.DB;
	const today = todayIn(c.env.TIMEZONE);
	const following = c.req.query('following') === '1' && !!m.series_id;
	const later = following ? await laterInSeries(db, m) : [];
	// Everyone on any of the upcoming ones hears about it, once, with the reason.
	const upcoming = [{ id: m.id, date: m.date }, ...later].filter((x) => x.date >= today);
	const reason = str((await readForm(c)).reason, 300);
	if (upcoming.length && !reason) return c.redirect(`/meetings/${m.id}/edit?error=reason`);
	const people = new Map<number, Member>();
	for (const x of upcoming) for (const p of await meetingPeople(db, { id: x.id, kind: m.kind })) people.set(p.id, p);
	const stmts = [db.prepare('DELETE FROM meetings WHERE id = ?').bind(m.id)];
	if (following) stmts.push(db.prepare(`DELETE ${LATER_IN_SERIES}`).bind(m.series_id, m.date, m.team_id));
	await db.batch(stmts);
	if (!upcoming.length) return c.redirect('/meetings?ok=deleted');
	const result = await announceCanceled(c.env, { ...m, date: upcoming[0].date }, [...people.values()], upcoming.slice(1).map((x) => x.date), { reason, by: v.name });
	return c.redirect(`/meetings?${result.error ? 'error=unsent' : result.sent ? 'ok=canceled' : 'ok=deleted'}`);
});

// ---------- the meeting record ----------

/**
 * Who's expected: everyone on its teams (all execs for exec meetings), anyone invited, and anyone
 * already marked. Club events are open to everyone, so only the people marked as there.
 */
type AttendanceRow = { member_id: number; meeting_id: number; status: AttendanceStatus; self_report: number };

async function rosterFor(db: D1Database, m: MeetingRow) {
	return all<Member & { status: AttendanceStatus | null; self_report: number | null }>(
		db,
		`SELECT mb.*, a.status, a.self_report FROM members mb
		 LEFT JOIN attendance a ON a.member_id = mb.id AND a.meeting_id = ?1
		 WHERE a.status IS NOT NULL OR (?2 = 'meeting' AND mb.active = 1 AND ${MEETING_EXPECTED})
		 ORDER BY mb.name COLLATE NOCASE`,
		m.id,
		m.kind
	);
}

async function attendanceHistory(db: D1Database, m: MeetingRow, v: Viewer) {
	const history = await all<MeetingRow>(db, `${MEETING_SELECT}
	 WHERE ${visible(v, MEETING_VISIBLE)} AND m.kind = ?2 AND (m.date, m.time, m.id) <= (?3, ?4, ?5)
	 AND (?2 = 'event' OR EXISTS (SELECT 1 FROM meeting_teams mt
	   WHERE mt.meeting_id = m.id AND mt.team_id IN (SELECT team_id FROM meeting_teams WHERE meeting_id = ?5)))
	 ORDER BY m.date DESC, m.time DESC, m.id DESC`, v.id, m.kind, m.date, m.time, m.id);
	if (!history.some((meeting) => meeting.id === m.id)) history.unshift(m);
	const ids = JSON.stringify(history.map((meeting) => meeting.id));
	const [rows, expected] = await Promise.all([
		all<AttendanceRow>(db, 'SELECT * FROM attendance WHERE meeting_id IN (SELECT value FROM json_each(?))', ids),
		m.kind === 'event' ? [] : all<{ meeting_id: number; member_id: number }>(db, `SELECT record.id AS meeting_id, mb.id AS member_id
		 FROM meetings record CROSS JOIN members mb WHERE record.id IN (SELECT value FROM json_each(?1))
		 AND mb.active = 1 AND ${MEETING_EXPECTED.replaceAll('?1', 'record.id')}`, ids)
	]);
	return { history: history.reverse(), rows, expected };
}

function attendanceLabel(status: AttendanceStatus, selfReport: number | null) {
	return status === 'present' ? 'Here' : status === 'late' && selfReport ? 'Partial' : STATUSES.find(([value]) => value === status)?.[1] ?? '';
}

function AttendanceHistory({ roster, history, rows, expected, zone }: {
	roster: Member[]; history: MeetingRow[]; rows: AttendanceRow[]; expected: { meeting_id: number; member_id: number }[]; zone: string;
}) {
	const byCell = new Map(rows.map((row) => [`${row.member_id}:${row.meeting_id}`, row]));
	const expectedCells = new Set(expected.map((row) => `${row.member_id}:${row.meeting_id}`));
	const people = new Map(roster.map((member) => [member.id, member.name]));
	if (!people.size) return null;
	const started = history.map((meeting) => meetingTiming(meeting, zone).started);
	return (
		<details class="card attendance-history">
			<summary class="link-btn">Attendance history</summary>
			<div class="table-scroll" tabindex={0} role="region" aria-label="Attendance history">
				<table class="attendance-sheet">
					<thead><tr><th scope="col">Member</th>{history.map((meeting) => (
						<th scope="col"><a href={`/meetings/${meeting.id}`} title={meeting.title}>{formatDate(meeting.date)}</a></th>
					))}</tr></thead>
					<tbody>{Array.from(people, ([memberId, name]) => (
						<tr><th scope="row">{name}</th>{history.map((meeting, i) => {
							const key = `${memberId}:${meeting.id}`;
							const entry = byCell.get(key);
							const absent = started[i] && (meeting.kind === 'event' || expectedCells.has(key));
							return <td>{entry ? <span class={`pill att-${entry.status}`}>{attendanceLabel(entry.status, entry.self_report)}</span> : absent ? 'Absent' : '—'}</td>;
						})}</tr>
					))}</tbody>
				</table>
			</div>
		</details>
	);
}

/** Club events: a checklist of the whole club instead of present/late/absent for each person. */
function WhoCame({ m, came, people }: { m: MeetingRow; came: Member[]; people: Member[] | null }) {
	const ids = new Set(came.map((r) => r.id));
	return (
		<>
			<h2 class="section-title">
				Who came {came.length > 0 && <span class="count">{came.length}</span>}
			</h2>
			{people ? (
				<form method="post" action={`/meetings/${m.id}/attendance`} class="card attendance">
					<div class="picker">
						<input type="search" placeholder="Find a person" aria-label="Find a person" data-picker-filter class="js-only" />
						<div class="picker-list">
							{people.map((p) => (
								<label>
									<input type="checkbox" name="came" value={String(p.id)} checked={ids.has(p.id)} />
									<PersonName p={p} netId={netIds(people)} />
								</label>
							))}
						</div>
					</div>
					<button class="btn primary">Save</button>
				</form>
			) : came.length ? (
				<ul class="att-list">
					{came.map((r) => (
						<li>{r.name}</li>
					))}
				</ul>
			) : (
				<Empty>Not recorded.</Empty>
			)}
		</>
	);
}

/** Emails everyone on an upcoming meeting about it, with how it repeats if it's part of a series. */
meetingRoutes.post('/meetings/:id/announce', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	const later = await laterInSeries(c.env.DB, m);
	const today = todayIn(c.env.TIMEZONE);
	const repeats = later.length ? `It repeats every ${cadence(m.date, later) === 14 ? '2 weeks' : 'week'} until ${formatDate(later[later.length - 1].date, today)}.` : undefined;
	const result = await announceMeeting(c.env, m, { repeats });
	return c.redirect(`/meetings/${m.id}?${result.error ? 'error=unsent' : 'ok=announced'}`);
});

/** The reminder email as the viewer would get it. */
meetingRoutes.get('/meetings/:id/reminder', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	return c.html(meetingEmail(v.name, emailMeeting(m), meetingReminderAt(m).date, c.env.APP_URL).html);
});

meetingRoutes.get('/meetings/:id', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m) return c.notFound();
	const today = todayIn(c.env.TIMEZONE);
	const editable = canEditMeeting(v, m);
	const remindAt = meetingReminderAt(m);
	const [roster, actions, people, toRemind, form, content, attendance, summary] = await Promise.all([
		rosterFor(c.env.DB, m),
		all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE t.meeting_id = ? ORDER BY t.status = 'open' DESC, t.due_date, a.name`, m.id),
		editable ? activeMembers(c.env.DB) : Promise.resolve([] as Member[]),
		editable && m.date >= today ? meetingPeople(c.env.DB, m) : Promise.resolve([] as Member[]),
		formForMeeting(c.env.DB, m.id),
		meetingContent(c.env.DB, m.id),
		attendanceHistory(c.env.DB, m, v),
		summaryRevisions(c.env.DB, m.id)
	]);
	const reminded = m.reminded_on === remindAt.date;
	const remindLater = remindAt.date > today || (remindAt.date === today && hourIn(c.env.TIMEZONE) < remindAt.hour);
	const marked = roster.filter((r) => r.status);
	const present = marked.filter((r) => r.status === 'present' || r.status === 'late').length;
	const others = people.filter((p) => !roster.some((r) => r.id === p.id));
	const defaultDue = addDays(m.date > today ? m.date : today, 7);
	const joint = m.kind === 'meeting' && meetingTeams(m).length > 1;
	const seriesLeft = editable ? (await laterInSeries(c.env.DB, m)).length : 0;
	const timing = meetingTiming(m, c.env.TIMEZONE);
	const view = c.req.query('view');
	const selectedView = ['preparation', 'follow-up', 'form', 'attendance', 'library'].includes(view ?? '') ? view : timing.ended ? 'follow-up' : 'preparation';
	const formView = selectedView === 'form';
	const followUp = selectedView === 'follow-up';
	const myAttendance = roster.find((r) => r.id === v.id);
	const canCheckIn = timing.started && !timing.ended && (m.kind === 'event' || !!myAttendance)
		&& (!myAttendance?.status || myAttendance.self_report === 1);

	return page(
		c,
		{ title: m.title, active: 'meetings' },
		<>
			<PageHead
				eyebrow={`${m.kind === 'event' ? 'Club event' : joint ? 'Joint meeting' : m.team_kind === 'exec' ? 'Exec meeting' : 'Project meeting'} · ${teamNames(m)}`}
				title={m.title}
				sub={
					<>
						{formatDate(m.date, today)}
						{m.time && `, ${formatTimeRange(m.time, m.end_time)}`}
						{m.location && ` · ${m.location}`}
						{` · ${m.host_name ? `Hosted by ${m.host_name}` : 'No host yet'}`}
						{m.doc_url && (
							<>
								{' · '}
								<a href={m.doc_url} target="_blank" rel="noopener noreferrer">
									Meeting doc ↗
								</a>
							</>
						)}
					</>
				}
				actions={
					editable && (
						<>
							{m.date >= today && <PostButton action={`/meetings/${m.id}/announce`} label="Email everyone" confirm={`Email everyone on it (${toRemind.length} ${toRemind.length === 1 ? 'person' : 'people'}) about this meeting${seriesLeft ? ' and its repeats' : ''} now?`} />}
							<a class="btn" href={`/meetings/${m.id}/edit`}>
								Edit
							</a>
						</>
					)
				}
			/>

			<div data-meeting-tabs>
				<nav class="seg meeting-tabs" role="tablist" aria-label="Meeting stages">
					<a id="preparation-tab" role="tab" aria-controls="meeting-preparation" aria-selected={selectedView === 'preparation'} tabindex={selectedView === 'preparation' ? 0 : -1} href={`/meetings/${m.id}?view=preparation`}>Agenda</a>
					<a id="follow-up-tab" role="tab" aria-controls="meeting-follow-up" aria-selected={followUp} tabindex={followUp ? 0 : -1} href={`/meetings/${m.id}?view=follow-up`}>Summary</a>
					<a id="form-tab" role="tab" aria-controls="meeting-form" aria-selected={formView} tabindex={formView ? 0 : -1} href={`/meetings/${m.id}?view=form`}>Form</a>
					<a id="attendance-tab" role="tab" aria-controls="meeting-attendance-panel" aria-selected={selectedView === 'attendance'} tabindex={selectedView === 'attendance' ? 0 : -1} href={`/meetings/${m.id}?view=attendance`}>Attendance</a>
					<a id="library-tab" role="tab" aria-controls="meeting-library-panel" aria-selected={selectedView === 'library'} tabindex={selectedView === 'library' ? 0 : -1} href={`/meetings/${m.id}?view=library`}>Library</a>
				</nav>
				<div id="meeting-preparation" class="meeting-tab-panel grid-2 wide-left" role="tabpanel" aria-labelledby="preparation-tab" hidden={selectedView !== 'preparation'}>
					<section>
						<MeetingAgenda m={m} viewer={v} content={content} zone={c.env.TIMEZONE} />
					</section>
					<aside>
					{toRemind.length > 0 && (reminded || remindLater) && (
						<p class="hint reminder-note">
							{reminded
								? `Reminder emailed to ${toRemind.length} ${toRemind.length === 1 ? 'person' : 'people'} on ${formatDate(remindAt.date, today)}.`
								: `Reminder email goes to ${toRemind.length} ${toRemind.length === 1 ? 'person' : 'people'} on ${formatDate(remindAt.date, today)} at ${formatTime(`${String(remindAt.hour).padStart(2, '0')}:00`)}.`}{' '}
							<a href={`/meetings/${m.id}/reminder`} target="_blank">
								Preview
							</a>
						</p>
					)}
					</aside>
				</div>
				<div id="meeting-follow-up" class="meeting-tab-panel grid-2 wide-left" role="tabpanel" aria-labelledby="follow-up-tab" hidden={!followUp}>
					<section>
						<MeetingSummary m={m} revisions={summary} zone={c.env.TIMEZONE} />
					<h2 class="section-title" id="actions">
						Action items
					</h2>
					<TaskList tasks={actions} today={today} viewer={v} show={['assignee']} back={`/meetings/${m.id}#actions`} empty="No action items yet." />
					{editable && (
						<form method="post" action={`/meetings/${m.id}/actions`} class="card action-form">
							<p class="hint">
								{joint ? `Each action item becomes a task on the person's team (${teamNames(m)})` : `Each action item becomes a ${m.team_name} task`}: the person is emailed now and reminded until it's done.
							</p>
							<div class="action-rows" data-rows>
								<div class="action-row" data-row>
									<input name="title" placeholder="What needs to happen" maxlength={200} aria-label="Action item" />
									<MemberSelect name="assignee" members={people} blank="Who" />
									<input type="date" name="due" value={defaultDue} aria-label="Due date" />
								</div>
							</div>
							<div class="form-actions">
								<button type="button" class="btn ghost" data-add-row>
									+ Another
								</button>
								<button class="btn primary">Add action items</button>
							</div>
						</form>
					)}
					</section>
					<aside>

					</aside>
				</div>
				<div id="meeting-attendance-panel" class="meeting-tab-panel" role="tabpanel" aria-labelledby="attendance-tab" hidden={selectedView !== 'attendance'}>
					{canCheckIn && (
						<form method="post" action={`/meetings/${m.id}/check-in`} class="card stack" data-attendance-autosave>
							<strong>Your attendance</strong>
							<Choice name="status" label="Check in" selected={myAttendance?.status ?? 'present'} options={[[ 'present', 'Here' ], [ 'late', 'Partial' ]]} />
							<noscript><div><button class="btn small primary">Save check-in</button></div></noscript>
						</form>
					)}
						<>
							<h2 class="section-title attendance-heading">
								Attendance <span class="muted">{marked.length ? `${present}/${marked.length} present` : ''}</span>
								{editable && roster.length > 0 && <button type="button" class="link-btn" form="meeting-attendance" data-all-present>Mark everyone present</button>}
							</h2>
							{editable ? (
								<form id="meeting-attendance" method="post" action={`/meetings/${m.id}/attendance`} class="card attendance" data-attendance-autosave>
									{roster.length ? (
										<>
											{roster.map((r) => (
												<div class="att-row" role="radiogroup" aria-label={r.name}>
													<span>
														<PersonName p={r} netId={netIds(roster)} />
													</span>
													<div class="seg">
														{STATUSES.map(([value, label]) => (
															<label>
																<input type="radio" name={`att_${r.id}`} value={value} checked={r.status === value} />
																<span>{label}</span>
															</label>
														))}
													</div>
												</div>
											))}
										</>
									) : (
										<Empty>No one is on this team yet. Add people below, or add team members on the Teams page.</Empty>
									)}
									<p class="hint" data-attendance-status role="status" aria-live="polite"></p>
									<noscript><button class="btn primary">Save attendance</button></noscript>
								</form>
							) : marked.length ? (
								<ul class="att-list">
									{marked.map((r) => (
										<li>
											<span>{r.name}</span>
											<span class={`pill att-${r.status}`}>{attendanceLabel(r.status!, r.self_report)}</span>
										</li>
									))}
								</ul>
							) : (
								<Empty>Attendance not taken.</Empty>
							)}
							{editable && <div class="attendance-add"><button type="button" class="icon-btn agenda-add-button" aria-label="Add someone to attendance" title="Add someone to attendance" aria-haspopup="dialog" aria-controls="attendance-add-dialog" data-members-dialog="attendance-add-dialog">+</button></div>}
							{editable && <dialog id="attendance-add-dialog" class="members-dialog" aria-labelledby="attendance-add-title"><div class="members-dialog-content stack">
								<header><h2 id="attendance-add-title">Add someone</h2><form method="dialog"><button class="icon-btn" aria-label="Close">?</button></form></header>
								{others.length ? <form method="post" action={`/meetings/${m.id}/attendance`} class="stack"><Field label="Person"><MemberSelect name="add" members={others} blank="Choose a person" required /></Field><div><button class="btn primary">Add</button></div></form> : <p class="hint">Everyone is already listed.</p>}
							</div></dialog>}
						</>
					<AttendanceHistory roster={roster} {...attendance} zone={c.env.TIMEZONE} />
				</div>
				<div id="meeting-library-panel" class="meeting-tab-panel" role="tabpanel" aria-labelledby="library-tab" hidden={selectedView !== 'library'}>
					<MeetingFiles m={m} viewer={v} content={content} zone={c.env.TIMEZONE} />
				</div>
				<div id="meeting-form" class="meeting-tab-panel" role="tabpanel" aria-labelledby="form-tab" hidden={!formView}>
					{!form && !editable ? <p class="hint">No form yet.</p> : <FormSection m={m} f={form} editable={editable} appUrl={c.env.APP_URL} />}
				</div>
			</div>
		</>
	);
});

meetingRoutes.post('/meetings/:id/check-in', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m) return c.notFound();
	const form = await readForm(c);
	const status = str(form.status);
	const timing = meetingTiming(m, c.env.TIMEZONE);
	const path = `/meetings/${m.id}`;
	if (!timing.started || timing.ended || (status !== 'present' && status !== 'late')) return c.redirect(`${path}?error=forbidden`);
	const result = await run(c.env.DB, `INSERT INTO attendance (meeting_id, member_id, status, self_report)
	 SELECT ?1, mb.id, ?4, 1 FROM members mb WHERE mb.id = ?3 AND mb.active = 1
	 AND (?2 = 'event' OR ${MEETING_EXPECTED})
	 ON CONFLICT(meeting_id, member_id) DO UPDATE SET status = excluded.status
	 WHERE attendance.self_report = 1`, m.id, m.kind, v.id, status);
	return c.redirect(`${path}?view=attendance&${result.meta.changes ? 'ok=attendance' : 'error=forbidden'}`);
});

meetingRoutes.post('/meetings/:id/attendance', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	const form = await readForm(c);

	const valid = new Set(STATUSES.map(([s]) => s));
	const stmts: D1PreparedStatement[] = [];
	const upsert = (memberId: number, status: string) =>
		c.env.DB.prepare('INSERT INTO attendance (meeting_id, member_id, status) VALUES (?, ?, ?) ON CONFLICT(meeting_id, member_id) DO UPDATE SET status = excluded.status, self_report = 0').bind(m.id, memberId, status);
	for (const [key, value] of Object.entries(form)) {
		const memberId = key.startsWith('att_') ? id(key.slice(4)) : null;
		const status = str(value);
		if (memberId && valid.has(status as AttendanceStatus)) stmts.push(upsert(memberId, status));
	}
	const added = id(form.add);
	if (added) stmts.push(upsert(added, 'present'));
	if (stmts.length) await c.env.DB.batch(stmts);
	return c.redirect(`/meetings/${m.id}?view=attendance&ok=attendance`);
});

meetingRoutes.post('/meetings/:id/actions', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	const form = await readForm(c);
	const titles = list(form.title);
	const assignees = list(form.assignee);
	const dues = list(form.due);
	// Check every row before creating any, so a typo in row 3 doesn't leave rows 1–2 half-sent.
	const rows: { title: string; assignee: number; due: string }[] = [];
	for (let i = 0; i < titles.length; i++) {
		const assignee = id(assignees[i]);
		if (!titles[i] && !assignee) continue;
		if (!titles[i] || !assignee) return c.redirect(`/meetings/${m.id}?error=missing#actions`);
		if (!isDate(dues[i])) return c.redirect(`/meetings/${m.id}?error=date#actions`);
		rows.push({ title: titles[i].slice(0, 200), assignee, due: dues[i] });
	}
	if (!rows.length) return c.redirect(`/meetings/${m.id}?error=missing#actions`);
	// A joint meeting files each task under whichever of its teams the person is on (and this
	// person may file under), falling back to the main team.
	const teamIds = meetingTeams(m).map((t) => t.id);
	const onTeams = await all<{ team_id: number; member_id: number }>(
		c.env.DB,
		'SELECT team_id, member_id FROM team_members WHERE member_id IN (SELECT value FROM json_each(?))',
		JSON.stringify(rows.map((r) => r.assignee))
	);
	const mayFile = (t: number) => isExec(v) || v.leadOf.has(t);
	const teamFor = (who: number) => teamIds.find((t) => mayFile(t) && onTeams.some((x) => x.member_id === who && x.team_id === t)) ?? teamIds.find(mayFile) ?? m.team_id;
	const ids: number[] = [];
	for (const row of rows) {
		const result = await createTasks(c.env, v, { title: row.title, details: '', assignees: [row.assignee], due: row.due, teamId: teamFor(row.assignee), meetingId: m.id });
		if ('error' in result) return c.redirect(`/meetings/${m.id}?error=${result.error}#actions`);
		ids.push(...result.ids);
	}
	await notifyAssigned(c.env, v, ids);
	return c.redirect(`/meetings/${m.id}?ok=assigned#actions`);
});
