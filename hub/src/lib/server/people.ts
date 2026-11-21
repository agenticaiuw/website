import type { Member } from '../types';
import type { BoardPerson } from '../people';
import { all, memberByEmail, run } from './db';
import { isEmail } from './form';

export type BoardRow = Member & BoardPerson;

export const BOARD_SQL = `
	SELECT m.*,
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'open') AS open,
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'open' AND t.due_date < ?1) AS overdue,
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'done') AS done,
		-- Done by the end of the due day in Chicago (midnight there is 05:00–06:00 UTC).
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'done'
			AND t.completed_at < strftime('%Y-%m-%dT%H:%M:%fZ', t.due_date, '+1 day', '+6 hours')) AS on_time,
		-- Attendance counts team meetings only; club events are optional.
		(SELECT COUNT(*) FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id WHERE a.member_id = m.id AND mt.kind = 'meeting') AS marked,
		(SELECT COUNT(*) FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id WHERE a.member_id = m.id AND mt.kind = 'meeting' AND a.status IN ('present', 'late')) AS attended,
		(SELECT COUNT(*) FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id WHERE a.member_id = m.id AND mt.kind = 'meeting' AND a.status = 'excused') AS excused,
		(SELECT group_concat(tm.name, ', ') FROM team_members x JOIN teams tm ON tm.id = x.team_id
			WHERE x.member_id = m.id AND tm.archived = 0) AS team_names
	FROM members m`;

/** Only the columns the People pages show, so nothing else on the members row reaches the browser. */
export const boardPerson = (r: BoardRow): BoardPerson => ({
	id: r.id,
	name: r.name,
	email: r.email,
	role: r.role,
	title: r.title,
	major: r.major,
	active: r.active,
	is_owner: r.is_owner,
	team_names: r.team_names,
	open: r.open,
	overdue: r.overdue,
	done: r.done,
	on_time: r.on_time,
	marked: r.marked,
	attended: r.attended,
	excused: r.excused
});

/** Puts someone on the roster by email (bringing them back if they'd left) and returns their id. Never renames anyone already on it. */
export async function addPerson(db: D1Database, name: string, email: string) {
	const clean = email.trim().toLowerCase();
	if (!name.trim() || !isEmail(clean)) return null;
	await run(
		db,
		"INSERT INTO members (name, email, role) VALUES (?, ?, 'member') ON CONFLICT(email) DO UPDATE SET active = 1 WHERE members.is_owner = 0",
		name.trim().slice(0, 100),
		clean.slice(0, 200)
	);
	return (await memberByEmail(db, clean))?.id ?? null;
}

/** Puts someone on a team (or sets whether they lead it). True when they weren't on it before. */
export async function addToTeam(db: D1Database, teamId: number, memberId: number, lead = false) {
	const was = await all(db, 'SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?', teamId, memberId);
	await run(
		db,
		'INSERT INTO team_members (team_id, member_id, is_lead) VALUES (?, ?, ?) ON CONFLICT(team_id, member_id) DO UPDATE SET is_lead = excluded.is_lead',
		teamId,
		memberId,
		lead ? 1 : 0
	);
	return !was.length;
}

/** Back to the team's own page when that's where the change was made, else the Teams page. */
export function teamBack(request: Request, teamId: number | null) {
	const ref = request.headers.get('referer') ?? '';
	return ref.includes(`/teams/${teamId}`) && !ref.includes(`/teams/${teamId}/`) ? `/teams/${teamId}?ok=saved` : `/teams?ok=saved#team-${teamId}`;
}
