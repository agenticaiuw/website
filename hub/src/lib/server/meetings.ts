import { addDays, daysBetween, isTime } from '../dates';
import { MAX_REPEATS, questionsOf, type AttendanceRow, type Content, type FormWithCount, type Revision } from '../meetings';
export { canWrite } from '../meetings';
import { meetingTeams } from '../meeting-teams';
import { canEditMeeting, isExec } from '../perm';
import type { AttendanceStatus, Env, FormResponse, Member, MeetingKind, MeetingRow, Viewer } from '../types';
import { all, first, HOST_NAMES, meetingById, MEETING_EXPECTED, MEETING_SELECT, MEETING_TEAMS_JSON, MEETING_VISIBLE, teamsByMember, visible } from './db';
import { id, isHttpUrl, list, str } from './form';
import { FILE_LIMIT, meetingFileType } from './meeting-content';

export const LIST_SELECT = `
	SELECT m.*, tm.name AS team_name, tm.kind AS team_kind, ${HOST_NAMES}, ${MEETING_TEAMS_JSON},
		(SELECT COUNT(*) FROM attendance x WHERE x.meeting_id = m.id AND x.status IN ('present', 'late')) AS present,
		(SELECT COUNT(*) FROM attendance x WHERE x.meeting_id = m.id) AS marked,
		(SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id) AS actions,
		(SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id AND t.status = 'open') AS open_actions
	FROM meetings m JOIN teams tm ON tm.id = m.team_id`;

/** Up to two hosts. A second host on their own becomes the host; the same person twice counts once. */
function readHosts(form: Record<string, unknown>) {
	const [host = null, cohost = null] = [...new Set([id(form.host), id(form.cohost)].filter((x): x is number => x !== null))];
	return { host, cohost };
}

export function readMeeting(form: Record<string, unknown>) {
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
		...readHosts(form),
		people: [...new Set(list(form.person).map(Number))].filter((n) => Number.isInteger(n) && n > 0),
		// Set by the people picker once team chips tick their people, so unticked team members can be skipped.
		synced: str(form.people_synced) === '1'
	};
}

type MeetingInput = ReturnType<typeof readMeeting>;

/**
 * Splits who's ticked into invites (not on its teams) and skips (on its teams but unticked).
 * Club events are open to everyone, so neither.
 */
export async function invitesAndSkips(db: D1Database, m: MeetingInput, teamIds: number[]) {
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
export async function pickedFor(db: D1Database, m: MeetingRow, teamsOf: Map<number, number[]>, people: Member[]) {
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
export const setWho = (db: D1Database, who: { invites: number[]; skips: number[] }, ids: string, ...params: (string | number)[]) => [
	...setPeople(db, 'meeting_invites', who.invites, ids, ...params),
	...setPeople(db, 'meeting_skips', who.skips, ids, ...params)
];

/** Replaces the teams of the meetings `ids` selects. `ids` uses ?1…?n for `params`. */
export function setTeams(db: D1Database, teamIds: number[], ids: string, ...params: (string | number)[]) {
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
export async function runnerFor(db: D1Database, v: Viewer, existing?: MeetingRow) {
	if (existing?.kind === 'event') return existing.team_id;
	if (isExec(v)) return (await first<{ id: number }>(db, "SELECT id FROM teams WHERE kind = 'exec' AND archived = 0 ORDER BY id"))?.id ?? null;
	return [...v.leadOf][0] ?? null;
}

/** The first date plus its repeats, up to and including `until`. */
export function repeatDates(firstDate: string, every: number, until: string) {
	const dates = [firstDate];
	if (every !== 7 && every !== 14) return dates;
	for (let d = addDays(firstDate, every); d <= until && dates.length < MAX_REPEATS; d = addDays(d, every)) dates.push(d);
	return dates;
}

/** Later meetings in the same series that changes to this one can carry over to. */
export const LATER_IN_SERIES = 'FROM meetings WHERE series_id = ?1 AND date > ?2 AND team_id = ?3';

export async function laterInSeries(db: D1Database, m: MeetingRow) {
	if (!m.series_id) return [];
	return all<{ id: number; date: string }>(db, `SELECT id, date ${LATER_IN_SERIES} ORDER BY date, id`, m.series_id, m.date, m.team_id);
}

/** How often a series repeats, from the gap to the next one: weekly unless it's two weeks. */
export const cadence = (date: string, later: { date: string }[]) => (later[0] && daysBetween(date, later[0].date) === 14 ? 14 : 7);

/**
 * Who's expected: everyone on its teams (all execs for exec meetings), anyone invited, and anyone
 * already marked. Club events are open to everyone, so only the people marked as there.
 */
export async function rosterFor(db: D1Database, m: MeetingRow) {
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

export async function attendanceHistory(db: D1Database, m: MeetingRow, v: Viewer) {
	const history = await all<MeetingRow>(
		db,
		`${MEETING_SELECT}
	 WHERE ${visible(v, MEETING_VISIBLE)} AND m.kind = ?2 AND (m.date, m.time, m.id) <= (?3, ?4, ?5)
	 AND (?2 = 'event' OR EXISTS (SELECT 1 FROM meeting_teams mt
	   WHERE mt.meeting_id = m.id AND mt.team_id IN (SELECT team_id FROM meeting_teams WHERE meeting_id = ?5)))
	 ORDER BY m.date DESC, m.time DESC, m.id DESC`,
		v.id,
		m.kind,
		m.date,
		m.time,
		m.id
	);
	if (!history.some((meeting) => meeting.id === m.id)) history.unshift(m);
	const ids = JSON.stringify(history.map((meeting) => meeting.id));
	const [rows, expected] = await Promise.all([
		all<AttendanceRow>(db, 'SELECT * FROM attendance WHERE meeting_id IN (SELECT value FROM json_each(?))', ids),
		m.kind === 'event'
			? []
			: all<{ meeting_id: number; member_id: number }>(
					db,
					`SELECT record.id AS meeting_id, mb.id AS member_id
		 FROM meetings record CROSS JOIN members mb WHERE record.id IN (SELECT value FROM json_each(?1))
		 AND mb.active = 1 AND ${MEETING_EXPECTED.replaceAll('?1', 'record.id')}`,
					ids
				)
	]);
	return { history: history.reverse(), rows, expected };
}

export async function meetingContent(db: D1Database, meetingId: number): Promise<Content> {
	const [agenda, files] = await Promise.all([
		all<Content['agenda'][number]>(
			db,
			`SELECT a.*, n.body, n.version AS note_version FROM meeting_agenda a
		 LEFT JOIN meeting_speaker_notes n ON n.agenda_id = a.id
		 WHERE a.meeting_id = ? ORDER BY a.position, a.id`,
			meetingId
		),
		all<Content['files'][number]>(
			db,
			`SELECT f.id, f.agenda_id, f.author_id, m.name AS author_name, f.created_at, COALESCE(f.display_name, f.name) AS name, f.media_type, f.size, NULL AS url, f.name AS original_name
		 FROM meeting_attachments f LEFT JOIN members m ON m.id = f.author_id WHERE f.meeting_id = ?1 AND f.removed = 0
		 UNION ALL SELECT l.id, NULL, l.author_id, m.name, l.created_at, l.name, 'text/uri-list', 0, l.url, l.name
		 FROM meeting_library_links l LEFT JOIN members m ON m.id = l.author_id WHERE l.meeting_id = ?1 AND l.removed = 0
		 ORDER BY 5 DESC, 1 DESC`,
			meetingId
		)
	]);
	return { agenda, files };
}

/** Uploads over the limit are turned away before they're read. */
export const tooBig = (request: Request) => Number(request.headers.get('content-length') ?? 0) > FILE_LIMIT + 65536;

export async function attachmentFiles(value: unknown): Promise<{ name: string; bytes: ArrayBuffer; type: string }[] | null> {
	const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
	const files: { name: string; bytes: ArrayBuffer; type: string }[] = [];
	let total = 0;
	for (const file of values) {
		if (file === '') continue;
		if (typeof file === 'string' || !(file instanceof File)) return null;
		if (!file.name && !file.size) continue;
		total += file.size;
		if (!file.size || total > FILE_LIMIT) return null;
		const bytes = await file.arrayBuffer();
		const type = meetingFileType(file.name, bytes);
		if (!type) return null;
		files.push({ name: file.name, bytes, type });
	}
	return files;
}

export function summaryRevisions(db: D1Database, meeting: number) {
	return all<Revision>(db, 'SELECT * FROM meeting_summary_revisions WHERE meeting_id = ? ORDER BY id', meeting);
}

export function formForMeeting(db: D1Database, meetingId: number) {
	return first<FormWithCount>(db, 'SELECT f.*, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = f.id) AS responses FROM forms f WHERE f.meeting_id = ?', meetingId);
}

/** 8 characters with nothing that reads two ways (no 0/o, 1/l), so it can be typed off the screen. */
export function shortToken() {
	const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
	return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]).join('');
}

/** A meeting the viewer may edit, or null. Forms are set up and read only by its editors. */
export async function editableMeeting(env: Env, v: Viewer, raw: string) {
	const meetingId = id(raw);
	const m = meetingId ? await meetingById(env.DB, meetingId) : null;
	return m && canEditMeeting(v, m) ? m : null;
}

/** The form and its responses, with each response's answers read. */
export async function responsesFor(env: Env, v: Viewer, raw: string) {
	const m = await editableMeeting(env, v, raw);
	const f = m && (await formForMeeting(env.DB, m.id));
	if (!m || !f) return null;
	const rows = await all<FormResponse>(env.DB, 'SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at', f.id);
	return { m, f, questions: questionsOf(f), rows: rows.map((r) => ({ ...r, a: JSON.parse(r.answers) as Record<string, string> })) };
}
