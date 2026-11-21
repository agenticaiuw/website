import { error, redirect } from '@sveltejs/kit';
import { first } from '$lib/server/db';
import { id, list, readForm, str } from '$lib/server/form';
import { loadTeamPage } from '$lib/server/team-page';
import { canManagePage, teamRoster } from '$lib/server/teams';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, locals: { env, viewer } }) => loadTeamPage(env, viewer, url, params.id, params.subteam);

export const actions: Actions = {
	default: async ({ params, request, locals: { env, viewer: v } }) => {
		const team = id(params.id);
		const subteam = id(params.subteam);
		const db = env.DB;
		if (!team || !subteam || !(await canManagePage(db, v, team)) || !(await first(db, 'SELECT 1 FROM subteams WHERE id = ? AND team_id = ?', subteam, team))) error(404, 'Not found');
		const path = `/teams/${team}/subteams/${subteam}`;
		const form = await readForm(request);
		const name = str(form.name, 100);
		if (!name) redirect(303, `${path}?error=missing`);
		if (await first(db, 'SELECT 1 FROM subteams WHERE team_id = ? AND name = ? AND id != ?', team, name, subteam)) redirect(303, `${path}?error=exists`);
		const members = [...new Set(list(form.member).map(id))];
		const eligible = new Set((await teamRoster(db, team)).map((m) => m.id));
		if (members.some((m) => m === null || !eligible.has(m))) redirect(303, `${path}?error=selection`);
		await db.batch([
			db.prepare('UPDATE subteams SET name = ?, description = ?, archived = ? WHERE id = ? AND team_id = ?').bind(name, str(form.description), str(form.archived) === '1' ? 1 : 0, subteam, team),
			db
				.prepare(
					`DELETE FROM subteam_members WHERE subteam_id = ?
		 AND member_id IN (SELECT id FROM members WHERE active = 1)
		 AND member_id NOT IN (SELECT value FROM json_each(?))`
				)
				.bind(subteam, JSON.stringify(members)),
			db
				.prepare(
					`INSERT INTO subteam_members (subteam_id, team_id, member_id)
		 SELECT ?, ?, value FROM json_each(?) WHERE 1 ON CONFLICT (subteam_id, member_id) DO NOTHING`
				)
				.bind(subteam, team, JSON.stringify(members))
		]);
		redirect(303, `${path}?ok=saved`);
	}
};
