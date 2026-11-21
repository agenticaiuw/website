import { redirect } from '@sveltejs/kit';
import { id, readForm, str } from '$lib/server/form';
import { run } from '$lib/server/db';
import { teamBack } from '$lib/server/people';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

/** A person's title on a team and whether they lead it. Execs are never leads: they run every team. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	if (!isExec(v)) redirect(303, '/?error=forbidden');
	const teamId = id(params.id);
	const form = await readForm(request);
	await run(
		env.DB,
		"UPDATE team_members SET title = ?, is_lead = ? * (SELECT role != 'exec' FROM members WHERE id = member_id) WHERE team_id = ? AND member_id = ?",
		str(form.title, 60),
		str(form.lead) === '1' ? 1 : 0,
		teamId ?? 0,
		id(params.member) ?? 0
	);
	redirect(303, teamBack(request, teamId));
};
