import { andList } from './emails';
import type { Member, MeetingRow, MeetingTeam, TaskRow, TaskStatus, Team, Viewer } from './types';

type Param = string | number | null;

export async function all<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
	return (await db.prepare(sql).bind(...params).all<T>()).results;
}

export function first<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T | null> {
	return db.prepare(sql).bind(...params).first<T>();
}

export function run(db: D1Database, sql: string, ...params: Param[]) {
	return db.prepare(sql).bind(...params).run();
}

export const nowIso = () => new Date().toISOString();

// ---------- members and teams ----------

export function memberByEmail(db: D1Database, email: string) {
	return first<Member>(db, 'SELECT * FROM members WHERE email = ?', email.trim().toLowerCase());
}

export function memberById(db: D1Database, id: number) {
	return first<Member>(db, 'SELECT * FROM members WHERE id = ?', id);
}

export function activeMembers(db: D1Database) {
	return all<Member>(db, 'SELECT * FROM members WHERE active = 1 ORDER BY name COLLATE NOCASE');
}

export function teams(db: D1Database, includeArchived = false) {
	return all<Team>(
		db,
		`SELECT * FROM teams ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY kind = 'project', name COLLATE NOCASE`
	);
}

export async function loadViewer(db: D1Database, member: Member): Promise<Viewer> {
	const rows = await all<{ team_id: number; is_lead: number }>(
		db,
		'SELECT team_id, is_lead FROM team_members WHERE member_id = ?',
		member.id
	);
	return {
		...member,
		teamIds: new Set(rows.map((r) => r.team_id)),
		leadOf: new Set(rows.filter((r) => r.is_lead).map((r) => r.team_id))
	};
}

// ---------- tasks ----------

export const TASK_SELECT = `
	SELECT t.*,
		a.name AS assignee_name, a.email AS assignee_email,
		b.name AS assigner_name,
		tm.name AS team_name, tm.kind AS team_kind,
		m.title AS meeting_title
	FROM tasks t
	JOIN members a ON a.id = t.assignee_id
	LEFT JOIN members b ON b.id = t.assigned_by
	LEFT JOIN teams tm ON tm.id = t.team_id
	LEFT JOIN meetings m ON m.id = t.meeting_id`;

/**
 * SQL that limits tasks to what a non-exec can see: their own, ones they assigned,
 * and tasks of project teams they're on. `?1` must be bound to the viewer's id.
 */
export const TASK_VISIBLE = `(
	t.assignee_id = ?1 OR t.assigned_by = ?1
	OR (tm.kind = 'project' AND t.team_id IN (SELECT team_id FROM team_members WHERE member_id = ?1))
)`;

/** Progress of every shared task among `tasks`, counting all copies, not just the ones listed. */
export async function groupStats(db: D1Database, tasks: Pick<TaskRow, 'group_id'>[]): Promise<Map<number, { total: number; done: number }>> {
	const ids = [...new Set(tasks.map((t) => t.group_id).filter((g) => g !== null))];
	if (!ids.length) return new Map();
	const rows = await all<{ id: number; total: number; done: number }>(
		db,
		`SELECT group_id AS id, SUM(status != 'dropped') AS total, SUM(status = 'done') AS done
		 FROM tasks WHERE group_id IN (SELECT value FROM json_each(?)) GROUP BY group_id`,
		JSON.stringify(ids)
	);
	return new Map(rows.map((r) => [r.id, r]));
}

export function taskById(db: D1Database, id: number) {
	return first<TaskRow>(db, `${TASK_SELECT} WHERE t.id = ?`, id);
}

export function logTask(db: D1Database, taskId: number, memberId: number | null, kind: string, body = '') {
	return db
		.prepare('INSERT INTO task_activity (task_id, member_id, kind, body) VALUES (?, ?, ?, ?)')
		.bind(taskId, memberId, kind, body);
}

export function setTaskStatus(db: D1Database, taskId: number, status: TaskStatus, actorId: number | null, note = '') {
	const now = nowIso();
	return db.batch([
		db.prepare('UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').bind(status, status === 'done' ? now : null, now, taskId),
		logTask(db, taskId, actorId, status === 'open' ? 'reopened' : status, note)
	]);
}

// ---------- meetings ----------

/** Every team meeting `m` is for, as JSON. Read it with meetingTeams(). */
export const MEETING_TEAMS_JSON = `(
	SELECT json_group_array(json_object('id', mt_t.id, 'name', mt_t.name, 'kind', mt_t.kind))
	FROM meeting_teams mt_x JOIN teams mt_t ON mt_t.id = mt_x.team_id WHERE mt_x.meeting_id = m.id
) AS teams_json`;

export const MEETING_SELECT = `
	SELECT m.*, tm.name AS team_name, tm.kind AS team_kind, ${MEETING_TEAMS_JSON}
	FROM meetings m JOIN teams tm ON tm.id = m.team_id`;

/** Every team a meeting is for, main team first. */
export function meetingTeams(m: Pick<MeetingRow, 'team_id' | 'team_name' | 'team_kind' | 'teams_json'>): MeetingTeam[] {
	let list: MeetingTeam[] = [];
	try {
		list = JSON.parse(m.teams_json ?? '[]');
	} catch {}
	if (!list.some((t) => t.id === m.team_id)) list.push({ id: m.team_id, name: m.team_name, kind: m.team_kind });
	return list.sort((a, b) => Number(b.id === m.team_id) - Number(a.id === m.team_id) || a.name.localeCompare(b.name));
}

/** "Browser", "Browser and PC", "Browser, Cloud and PC". */
export const teamNames = (m: Parameters<typeof meetingTeams>[0]) => andList(meetingTeams(m).map((t) => t.name));

/** Same idea as TASK_VISIBLE, for meetings; club events are open to everyone. `?1` is the viewer's id. */
export const MEETING_VISIBLE = `(
	m.kind = 'event'
	OR m.id IN (
		SELECT mv.meeting_id FROM meeting_teams mv JOIN teams tv ON tv.id = mv.team_id
		JOIN team_members xv ON xv.team_id = mv.team_id WHERE xv.member_id = ?1 AND tv.kind = 'project'
	)
	OR m.id IN (SELECT meeting_id FROM attendance WHERE member_id = ?1)
	OR m.id IN (SELECT meeting_id FROM meeting_invites WHERE member_id = ?1)
)`;

/**
 * Members (`mb`) a meeting is for: everyone on any of its teams, every exec if one of them is the
 * exec team, and anyone invited. `?1` is the meeting's id.
 */
export const MEETING_EXPECTED = `(
	(mb.id NOT IN (SELECT member_id FROM meeting_skips WHERE meeting_id = ?1) AND (
		mb.id IN (SELECT xe.member_id FROM team_members xe JOIN meeting_teams me ON me.team_id = xe.team_id WHERE me.meeting_id = ?1)
		OR (mb.role = 'exec' AND EXISTS (SELECT 1 FROM meeting_teams me JOIN teams te ON te.id = me.team_id WHERE me.meeting_id = ?1 AND te.kind = 'exec'))
	))
	OR mb.id IN (SELECT member_id FROM meeting_invites WHERE meeting_id = ?1)
)`;

/**
 * Team ids for each active member, counting every exec as on the exec team the way meetings do.
 * Pickers use it to tick a whole team at once.
 */
export async function teamsByMember(db: D1Database) {
	const rows = await all<{ member_id: number; team_id: number }>(
		db,
		`SELECT x.member_id, x.team_id FROM team_members x JOIN teams t ON t.id = x.team_id JOIN members mb ON mb.id = x.member_id
		 WHERE t.archived = 0 AND mb.active = 1
		 UNION SELECT mb.id, t.id FROM members mb JOIN teams t ON t.kind = 'exec' AND t.archived = 0 WHERE mb.role = 'exec' AND mb.active = 1`
	);
	const map = new Map<number, number[]>();
	for (const r of rows) map.set(r.member_id, [...(map.get(r.member_id) ?? []), r.team_id]);
	return map;
}

export function meetingById(db: D1Database, id: number) {
	return first<MeetingRow>(db, `${MEETING_SELECT} WHERE m.id = ?`, id);
}

/**
 * The visibility clause for a viewer. Execs see everything; their clause still mentions
 * ?1 so every query binds the viewer's id the same way.
 */
export const visible = (viewer: Viewer, clause: string) => (viewer.role === 'exec' ? '(?1 > 0)' : clause);

// ---------- meta ----------

export async function getMeta(db: D1Database, key: string) {
	return (await first<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', key))?.value ?? null;
}

export function setMeta(db: D1Database, key: string, value: string) {
	return run(db, 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
