import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { canManagePage } from '$lib/server/teams';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const team = id(params.id);
	if (!team || !(await canManagePage(env.DB, v, team))) error(404, 'Not found');
	const name = str((await readForm(request)).name, 100);
	if (!name) redirect(303, `/teams/${team}?error=missing`);
	const result = await run(
		env.DB,
		`INSERT INTO subteams (team_id, name)
	 SELECT id, ? FROM teams WHERE id = ? ON CONFLICT (team_id, name) DO NOTHING`,
		name,
		team
	);
	redirect(303, result.meta.changes ? `/teams/${team}/subteams/${result.meta.last_row_id}?ok=created` : `/teams/${team}?error=exists`);
};
