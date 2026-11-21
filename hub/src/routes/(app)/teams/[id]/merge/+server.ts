import { redirect } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { id, readForm } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

/** Moves a team's people, open tasks and upcoming meetings into another team, then archives it. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	if (!isExec(v)) redirect(303, '/?error=forbidden');
	const from = id(params.id);
	const into = id((await readForm(request)).into);
	if (!from || !into || from === into) redirect(303, `/teams/${from}?error=missing`);
	const db = env.DB;
	const today = todayIn(env.TIMEZONE);
	const upcoming = 'SELECT meeting_id FROM meeting_teams WHERE team_id = ?1 AND meeting_id IN (SELECT id FROM meetings WHERE date >= ?3)';
	await db.batch([
		db
			.prepare('INSERT INTO team_members (team_id, member_id, is_lead) SELECT ?2, member_id, is_lead FROM team_members WHERE team_id = ?1 ON CONFLICT(team_id, member_id) DO UPDATE SET is_lead = MAX(is_lead, excluded.is_lead)')
			.bind(from, into),
		db.prepare("UPDATE tasks SET team_id = ?2 WHERE team_id = ?1 AND status = 'open'").bind(from, into),
		db.prepare(`UPDATE meetings SET team_id = ?2 WHERE team_id = ?1 AND date >= ?3`).bind(from, into, today),
		db
			.prepare(`INSERT OR IGNORE INTO meeting_teams (meeting_id, team_id) SELECT meeting_id, ?2 FROM meeting_teams WHERE team_id = ?1 AND meeting_id IN (SELECT id FROM meetings WHERE date >= ?3)`)
			.bind(from, into, today),
		db.prepare(`DELETE FROM meeting_teams WHERE team_id = ?1 AND meeting_id IN (${upcoming})`).bind(from, into, today),
		db.prepare('UPDATE teams SET archived = 1 WHERE id = ?').bind(from)
	]);
	redirect(303, `/teams/${into}?ok=saved`);
};
