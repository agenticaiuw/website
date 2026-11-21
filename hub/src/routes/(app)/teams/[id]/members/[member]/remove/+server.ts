import { redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id } from '$lib/server/form';
import { teamBack } from '$lib/server/people';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	if (!isExec(v)) redirect(303, '/?error=forbidden');
	const teamId = id(params.id);
	await run(env.DB, 'DELETE FROM team_members WHERE team_id = ? AND member_id = ?', teamId ?? 0, id(params.member) ?? 0);
	redirect(303, teamBack(request, teamId));
};
