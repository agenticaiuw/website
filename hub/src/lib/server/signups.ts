// The public team sign-up form at /join: someone gives their full name and major, picks a project
// team, and gets the link to book a meeting with that team's head (the team's exec).
import { MAJORS } from '../majors.ts';
import { all, first, run } from './db.ts';
import { isHttpUrl } from './form.ts';

/** More sign-ups than this in ten minutes, from everyone together, is a bot. */
const BURST = 30;

export type JoinTeam = { id: number; name: string };
export type SignupRow = { name: string; major: string; created_at: string };

/** The teams people can sign up for: active project teams. */
export const joinTeams = (db: D1Database) => all<JoinTeam>(db, "SELECT id, name FROM teams WHERE kind = 'project' AND archived = 0 ORDER BY name COLLATE NOCASE");

/** Saves one sign-up. Returns the team, its booking link and its head's names, or why it was refused. */
export async function addSignup(db: D1Database, name: string, major: string, teamId: number | null, now = new Date()) {
	if (!name || !MAJORS.includes(major) || !teamId) return { error: 'missing' as const };
	const team = await first<{ id: number; name: string; cal_url: string | null }>(db, "SELECT id, name, cal_url FROM teams WHERE id = ? AND kind = 'project' AND archived = 0", teamId);
	if (!team) return { error: 'missing' as const };
	const recent = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM team_signups WHERE created_at >= ?', new Date(now.getTime() - 10 * 60_000).toISOString());
	if ((recent?.n ?? 0) >= BURST) return { error: 'busy' as const };
	await run(db, 'INSERT INTO team_signups (name, major, team_id) VALUES (?, ?, ?)', name, major, team.id);
	const heads = await all<{ name: string }>(
		db,
		"SELECT m.name FROM team_members tm JOIN members m ON m.id = tm.member_id WHERE tm.team_id = ? AND m.active = 1 AND m.role = 'exec' ORDER BY m.name COLLATE NOCASE",
		team.id
	);
	const cal = team.cal_url && isHttpUrl(team.cal_url) ? team.cal_url : '';
	return { team: team.name, cal, heads: heads.map((h) => h.name) };
}

/** A team's sign-ups, newest first, for its execs and leads. */
export const teamSignups = (db: D1Database, team: number) => all<SignupRow>(db, 'SELECT name, major, created_at FROM team_signups WHERE team_id = ? ORDER BY created_at DESC LIMIT 200', team);
