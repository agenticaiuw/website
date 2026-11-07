import { Hono } from 'hono';
import { addDays, formatDate, formatTime, formatTimeRange, hourIn, isDate, isTime, todayIn } from '../dates';
import { activeMembers, all, first, MEETING_EXPECTED, MEETING_TEAMS_JSON, MEETING_VISIBLE, meetingById, meetingTeams, nowIso, TASK_SELECT, teamNames, teams, teamsByMember, visible } from '../db';
import { meetingEmail } from '../emails';
import { id, isHttpUrl, list, readForm, str } from '../form';
import { canAssign, canEditMeeting, canSeeMeeting, isExec, teamsFor } from '../perm';
import { announceMeeting, emailMeeting, meetingPeople, notifyAssigned } from '../reminders';
import { meetingReminderAt } from '../schedule';
import type { AppEnv, AttendanceStatus, Member, MeetingKind, MeetingRow, TaskRow, Viewer } from '../types';
import { page } from '../views/layout';
import { Choice, Empty, Field, Markdown, MemberSelect, PageHead, PeoplePicker, Tabs, TaskList } from '../views/ui';
import { FormSection, formForMeeting } from './forms';
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
	SELECT m.*, tm.name AS team_name, tm.kind AS team_kind, ${MEETING_TEAMS_JSON},
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
	const team = events ? null : id(c.req.query('team'));
	const where = [visible(v, MEETING_VISIBLE)];
	const params: (string | number)[] = [v.id, today];
	if (events) where.push("m.kind = 'event'");
	if (team) where.push(`m.id IN (SELECT meeting_id FROM meeting_teams WHERE team_id = ?${params.push(team)})`);
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
				<Tabs<string | number>
					label="Show"
					current={events ? 'events' : team}
					href={(t) => (t === 'events' ? '/meetings?kind=event' : t ? `/meetings?team=${t}` : '/meetings')}
					options={[[null, 'All'], ['events', 'Club events'], ...visibleTeams.map((t): [number, string] => [t.id, t.name])]}
				/>
			</div>
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

function MeetingForm({ v, teamList, people, picked, teamsOf, m, kind, action, today, later = 0 }: { v: Viewer; teamList: { id: number; name: string }[]; people: Member[]; picked: Set<number>; teamsOf: Map<number, number[]>; m?: MeetingRow; kind: MeetingKind; action: string; today: string; later?: number }) {
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
			{!m && (
				<>
					<Choice name="repeat" label="Repeats" selected="0" options={REPEATS} />
					<label class="field until">
						<span class="label">Until</span>
						<input type="date" name="until" value={addDays(today, 63)} />
						<span class="hint">Up to {MAX_REPEATS} dates. Each one gets its own page for notes and attendance.</span>
					</label>
				</>
			)}
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
			{!m && (
				<div class="field wide">
					<label class="check">
						<input type="checkbox" name="notify" value="1" />
						Email everyone about it now
					</label>
					<span class="hint">One email to everyone ticked above (the whole club for a club event). The usual reminder still goes out before it.</span>
				</div>
			)}
			{later > 0 && (
				<label class="check wide">
					<input type="checkbox" name="series" value="1" />
					Also change the {later} later {later === 1 ? 'one' : 'ones'} in this series (everything but the date, agenda and notes)
				</label>
			)}
			<div class="form-actions wide">
				<button class="btn primary">{m ? 'Save' : 'Create'}</button>
				<a class="btn ghost" href={m ? `/meetings/${m.id}` : '/meetings'}>
					Cancel
				</a>
				{m && (isExec(v) || m.created_by === v.id) && (
					<>
						<span class="spacer"></span>
						{later > 0 && (
							<button class="btn danger" formaction={`/meetings/${m.id}/delete?following=1`} data-confirm={`Delete this and the ${later} after it, with their attendance? Their action items stay as tasks.`}>
								Delete this and later
							</button>
						)}
						<button class="btn danger" formaction={`/meetings/${m.id}/delete`} data-confirm="Delete this and its attendance? Its action items stay as tasks.">
							Delete
						</button>
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
			.prepare('INSERT INTO meetings (team_id, kind, series_id, title, date, time, end_time, location, doc_url, agenda, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(teamId, m.kind, seriesId, m.title, date, m.time, m.endTime, m.location, m.docUrl, m.agenda, notes, v.id);
	const firstId = Number((await insert(m.date, m.notes, null).run()).meta.last_row_id);
	const created = 'SELECT id FROM meetings WHERE id = ?1 OR series_id = ?1';
	await db.batch([
		// Repeats copy everything but the notes, and share the first one's id.
		...(dates.length > 1 ? [db.prepare('UPDATE meetings SET series_id = ?1 WHERE id = ?1').bind(firstId), ...dates.slice(1).map((d) => insert(d, '', firstId))] : []),
		...setTeams(db, m.teamIds, created, firstId),
		...setWho(db, who, created, firstId)
	]);
	const ok = dates.length > 1 ? 'scheduled' : 'created';
	if (str(form.notify) !== '1') return c.redirect(`/meetings/${firstId}?ok=${ok}`);

	const meeting = await meetingById(db, firstId);
	const today = todayIn(c.env.TIMEZONE);
	const repeats = dates.length > 1 ? `It repeats every ${every === 7 ? 'week' : '2 weeks'} until ${formatDate(dates[dates.length - 1], today)}.` : undefined;
	const result = meeting ? await announceMeeting(c.env, meeting, v.id, repeats) : { sent: 0, error: 'not found' };
	if (result.error) return c.redirect(`/meetings/${firstId}?error=unsent`);
	return c.redirect(`/meetings/${firstId}?ok=${!result.sent ? ok : ok === 'scheduled' ? 'scheduled-emailed' : 'emailed'}`);
});

/** Every quarter hour from 7 AM to 11:45 PM, plus a saved time that falls between them. */
function TimeSelect({ name, value, label }: { name: string; value: string; label: string }) {
	const times = Array.from({ length: 68 }, (_, i) => {
		const mins = 7 * 60 + i * 15;
		return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
	});
	if (isTime(value) && !times.includes(value)) times.push(value);
	return (
		<select name={name} aria-label={label}>
			<option value="">—</option>
			{times.sort().map((t) => (
				<option value={t} selected={t === value}>
					{formatTime(t)}
				</option>
			))}
		</select>
	);
}

async function loadMeeting(c: { env: AppEnv['Bindings'] }, v: Viewer, raw: string) {
	const meetingId = id(raw);
	const m = meetingId ? await meetingById(c.env.DB, meetingId) : null;
	if (!m) return null;
	const listed = !!(await first(
		c.env.DB,
		'SELECT 1 FROM attendance WHERE meeting_id = ?1 AND member_id = ?2 UNION ALL SELECT 1 FROM meeting_invites WHERE meeting_id = ?1 AND member_id = ?2',
		m.id,
		v.id
	));
	return canSeeMeeting(v, m, listed) ? m : null;
}

/** Later meetings in the same series that changes to this one can carry over to. */
const LATER_IN_SERIES = 'FROM meetings WHERE series_id = ?1 AND date > ?2 AND team_id = ?3';

async function laterInSeries(db: D1Database, m: MeetingRow) {
	if (!m.series_id) return 0;
	return (await first<{ n: number }>(db, `SELECT COUNT(*) AS n ${LATER_IN_SERIES}`, m.series_id, m.date, m.team_id))?.n ?? 0;
}

meetingRoutes.get('/meetings/:id/edit', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	const [allTeams, later, people, teamsOf] = await Promise.all([teams(c.env.DB), laterInSeries(c.env.DB, m), activeMembers(c.env.DB), teamsByMember(c.env.DB)]);
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
			<MeetingForm v={v} teamList={teamList} people={people} picked={picked} teamsOf={teamsOf} m={m} kind={m.kind} action={`/meetings/${m.id}`} today={todayIn(c.env.TIMEZONE)} later={later} />
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
	// Leads can add only teams they lead; teams already on it can stay.
	const before = new Set(meetingTeams(existing).map((t) => t.id));
	if (!isExec(v) && m.teamIds.some((t) => !before.has(t) && !v.leadOf.has(t))) return c.redirect(`/meetings/${existing.id}/edit?error=forbidden`);
	const db = c.env.DB;
	const now = nowIso();
	const who = await invitesAndSkips(db, m, m.teamIds);
	const stmts = [
		db
			.prepare('UPDATE meetings SET kind = ?, team_id = ?, title = ?, date = ?, time = ?, end_time = ?, location = ?, doc_url = ?, agenda = ?, notes = ?, updated_at = ? WHERE id = ?')
			.bind(m.kind, teamId, m.title, m.date, m.time, m.endTime, m.location, m.docUrl, m.agenda, m.notes, now, existing.id),
		...setTeams(db, m.teamIds, '?1', existing.id),
		...setWho(db, who, '?1', existing.id)
	];
	if (str(form.series) === '1' && existing.series_id) {
		const later = [`SELECT id ${LATER_IN_SERIES}`, existing.series_id, existing.date, existing.team_id] as const;
		stmts.push(
			// Before the update below, while the later ones still have the old main team.
			...setTeams(db, m.teamIds, ...later),
			...setWho(db, who, ...later),
			db
				.prepare(`UPDATE meetings SET kind = ?4, team_id = ?5, title = ?6, time = ?7, end_time = ?8, location = ?9, doc_url = ?10, updated_at = ?11 WHERE id IN (SELECT id ${LATER_IN_SERIES})`)
				.bind(existing.series_id, existing.date, existing.team_id, m.kind, teamId, m.title, m.time, m.endTime, m.location, m.docUrl, now)
		);
	}
	await db.batch(stmts);
	return c.redirect(`/meetings/${existing.id}?ok=saved`);
});

meetingRoutes.post('/meetings/:id/delete', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !(isExec(v) || m.created_by === v.id)) return c.notFound();
	const db = c.env.DB;
	const stmts = [db.prepare('DELETE FROM meetings WHERE id = ?').bind(m.id)];
	if (c.req.query('following') === '1' && m.series_id) stmts.push(db.prepare(`DELETE ${LATER_IN_SERIES}`).bind(m.series_id, m.date, m.team_id));
	await db.batch(stmts);
	return c.redirect('/meetings?ok=deleted');
});

// ---------- the meeting record ----------

/**
 * Who's expected: everyone on its teams (all execs for exec meetings), anyone invited, and anyone
 * already marked. Club events are open to everyone, so only the people marked as there.
 */
async function rosterFor(db: D1Database, m: MeetingRow) {
	return all<Member & { status: AttendanceStatus | null }>(
		db,
		`SELECT mb.*, a.status FROM members mb
		 LEFT JOIN attendance a ON a.member_id = mb.id AND a.meeting_id = ?1
		 WHERE a.status IS NOT NULL OR (?2 = 'meeting' AND mb.active = 1 AND ${MEETING_EXPECTED})
		 ORDER BY mb.name COLLATE NOCASE`,
		m.id,
		m.kind
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
									{p.name}
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
	const [roster, actions, people, toRemind, form] = await Promise.all([
		rosterFor(c.env.DB, m),
		all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE t.meeting_id = ? ORDER BY t.status = 'open' DESC, t.due_date, a.name`, m.id),
		editable ? activeMembers(c.env.DB) : Promise.resolve([] as Member[]),
		editable && m.date >= today ? meetingPeople(c.env.DB, m) : Promise.resolve([] as Member[]),
		formForMeeting(c.env.DB, m.id)
	]);
	const reminded = m.reminded_on === remindAt.date;
	const remindLater = remindAt.date > today || (remindAt.date === today && hourIn(c.env.TIMEZONE) < remindAt.hour);
	const marked = roster.filter((r) => r.status);
	const present = marked.filter((r) => r.status === 'present' || r.status === 'late').length;
	const others = people.filter((p) => !roster.some((r) => r.id === p.id));
	const defaultDue = addDays(m.date > today ? m.date : today, 7);
	const joint = m.kind === 'meeting' && meetingTeams(m).length > 1;

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
						<a class="btn" href={`/meetings/${m.id}/edit`}>
							Edit
						</a>
					)
				}
			/>

			<div class="grid-2 wide-left">
				<section>
					<h2 class="section-title">Agenda</h2>
					<Markdown text={m.agenda} empty="No agenda recorded." />
					<h2 class="section-title">Notes</h2>
					<Markdown text={m.notes} empty="No notes yet." />

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
					<FormSection m={m} f={form} editable={editable} appUrl={c.env.APP_URL} />
					{m.kind === 'event' ? (
						<WhoCame m={m} came={marked} people={editable ? people : null} />
					) : (
						<>
							<h2 class="section-title">
								Attendance <span class="muted">{marked.length ? `${present}/${marked.length} present` : ''}</span>
							</h2>
							{editable ? (
								<form method="post" action={`/meetings/${m.id}/attendance`} class="card attendance">
									{roster.length ? (
										<>
											<div class="att-tools">
												<button type="button" class="link-btn" data-all-present>
													Mark everyone present
												</button>
											</div>
											{roster.map((r) => (
												<div class="att-row" role="radiogroup" aria-label={r.name}>
													<span>{r.name}</span>
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
									{others.length > 0 && (
										<label class="field">
											<span class="label">Someone else came</span>
											<MemberSelect name="add" members={others} blank="Add a person (marked present)" />
										</label>
									)}
									<button class="btn primary">Save attendance</button>
								</form>
							) : marked.length ? (
								<ul class="att-list">
									{marked.map((r) => (
										<li>
											<span>{r.name}</span>
											<span class={`pill att-${r.status}`}>{r.status}</span>
										</li>
									))}
								</ul>
							) : (
								<Empty>Attendance not taken.</Empty>
							)}
						</>
					)}
				</aside>
			</div>
		</>
	);
});

meetingRoutes.post('/meetings/:id/attendance', async (c) => {
	const v = c.get('viewer');
	const m = await loadMeeting(c, v, c.req.param('id'));
	if (!m || !canEditMeeting(v, m)) return c.notFound();
	const form = await readForm(c);
	if (m.kind === 'event') {
		const came = list(form.came).map(Number).filter((n) => Number.isInteger(n) && n > 0);
		const db = c.env.DB;
		await db.batch([
			// The checklist only lists active members; leave anyone else's record alone.
			db.prepare('DELETE FROM attendance WHERE meeting_id = ? AND member_id IN (SELECT id FROM members WHERE active = 1)').bind(m.id),
			...came.map((memberId) => db.prepare("INSERT OR REPLACE INTO attendance (meeting_id, member_id, status) VALUES (?, ?, 'present')").bind(m.id, memberId))
		]);
		return c.redirect(`/meetings/${m.id}?ok=attendance`);
	}
	const valid = new Set(STATUSES.map(([s]) => s));
	const stmts: D1PreparedStatement[] = [];
	const upsert = (memberId: number, status: string) =>
		c.env.DB.prepare('INSERT INTO attendance (meeting_id, member_id, status) VALUES (?, ?, ?) ON CONFLICT(meeting_id, member_id) DO UPDATE SET status = excluded.status').bind(m.id, memberId, status);
	for (const [key, value] of Object.entries(form)) {
		const memberId = key.startsWith('att_') ? id(key.slice(4)) : null;
		const status = str(value);
		if (memberId && valid.has(status as AttendanceStatus)) stmts.push(upsert(memberId, status));
	}
	const added = id(form.add);
	if (added) stmts.push(upsert(added, 'present'));
	if (stmts.length) await c.env.DB.batch(stmts);
	return c.redirect(`/meetings/${m.id}?ok=attendance`);
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
