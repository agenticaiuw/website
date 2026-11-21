import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { canManagePage } from '$lib/server/teams';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const team = id(params.id);
	const subteam = id(params.subteam);
	if (!team || !subteam || !(await canManagePage(env.DB, v, team))) error(404, 'Not found');
	const form = await readForm(request);
	const member = id(form.member);
	const path = str(form.origin) === 'team' ? `/teams/${team}` : `/teams/${team}/subteams/${subteam}`;
	if (!member) redirect(303, `${path}?error=selection`);
	const result = await run(
		env.DB,
		`INSERT INTO subteam_members (subteam_id, team_id, member_id)
		SELECT s.id, s.team_id, m.id FROM subteams s JOIN team_members tm ON tm.team_id = s.team_id
		JOIN members m ON m.id = tm.member_id AND m.active = 1
		WHERE s.id = ? AND s.team_id = ? AND s.archived = 0 AND m.id = ?
		ON CONFLICT (subteam_id, member_id) DO NOTHING`,
		subteam,
		team,
		member
	);
	redirect(303, `${path}?${result.meta.changes ? 'ok=saved' : 'error=selection'}`);
};
