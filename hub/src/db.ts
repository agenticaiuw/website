import type { Member, MeetingRow, TaskRow, TaskStatus, Team, Viewer } from './types';

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

export const MEETING_SELECT = `
	SELECT m.*, tm.name AS team_name, tm.kind AS team_kind
	FROM meetings m JOIN teams tm ON tm.id = m.team_id`;

/** Same idea as TASK_VISIBLE, for meetings; club events are open to everyone. `?1` is the viewer's id. */
export const MEETING_VISIBLE = `(
	m.kind = 'event'
	OR (tm.kind = 'project' AND m.team_id IN (SELECT team_id FROM team_members WHERE member_id = ?1))
	OR m.id IN (SELECT meeting_id FROM attendance WHERE member_id = ?1)
	OR m.id IN (SELECT meeting_id FROM meeting_invites WHERE member_id = ?1)
)`;

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
