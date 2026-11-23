// The public team sign-up form at /join: someone gives their full name and major, picks a project
// team, and gets the link to book a meeting with that team's head. The links are the office hours
// links on the website's board cards (site content), the same ones the website's Join page shows.
import { MAJORS } from '../majors.ts';
import { all, first, run } from './db.ts';
import { isHttpUrl } from './form.ts';

/** More sign-ups than this in ten minutes, from everyone together, is a bot. */
const BURST = 30;

export type JoinTeam = { id: number; name: string };
export type Booking = { name: string; url: string };
/** The website's Project teams and Board members sections, as the hub saves them. */
export type JoinSite = { teams: Record<string, unknown>; board: Record<string, unknown> };

const plain = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/**
 * The booking links of the heads of this hub team, from the website's board cards: the website team
 * linked to it (by id, or by name for one saved before teams were linked) gives the team's key, and
 * every board card with that key and an http(s) office hours link is one of its heads.
 */
export function headBookings(team: { id: number; name: string }, site: JoinSite): Booking[] {
	const item = list(site.teams.items).find((t) => Number(t.team) === team.id) ?? list(site.teams.items).find((t) => [t.short, t.name].some((n) => plain(n) === plain(team.name)));
	const key = plain(item?.k);
	return list(site.board.members)
		.filter((m) => (key ? plain(m.subteam) === key : plain(m.leads) === plain(team.name)) && isHttpUrl(String(m.officeHours ?? '')))
		.map((m) => ({ name: String(m.name ?? '').trim(), url: String(m.officeHours) }));
}
export type SignupRow = { name: string; major: string; created_at: string };

/** The teams people can sign up for: active project teams. */
export const joinTeams = (db: D1Database) => all<JoinTeam>(db, "SELECT id, name FROM teams WHERE kind = 'project' AND archived = 0 ORDER BY name COLLATE NOCASE");

/** Saves one sign-up. Returns the team, its heads' booking links and their names, or why it was refused. */
export async function addSignup(db: D1Database, site: JoinSite, name: string, major: string, teamId: number | null, now = new Date()) {
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
	// The team's own meeting link stands in only when no board card has one.
	const bookings = headBookings(team, site);
	if (!bookings.length && team.cal_url && isHttpUrl(team.cal_url)) bookings.push({ name: '', url: team.cal_url });
	return { team: team.name, bookings, heads: heads.map((h) => h.name) };
}

/** A team's sign-ups, newest first, for its execs and leads. */
export const teamSignups = (db: D1Database, team: number) => all<SignupRow>(db, 'SELECT name, major, created_at FROM team_signups WHERE team_id = ? ORDER BY created_at DESC LIMIT 200', team);
