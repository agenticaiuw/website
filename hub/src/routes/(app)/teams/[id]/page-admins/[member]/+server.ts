import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	if (!isExec(v)) error(404, 'Not found');
	const team = id(params.id);
	const member = id(params.member);
	if (!team || !member) error(404, 'Not found');
	const enabled = str((await readForm(request)).enabled);
	if (enabled !== '1' && enabled !== '0') error(404, 'Not found');
	await run(env.DB, 'UPDATE team_members SET can_manage_page = ? WHERE team_id = ? AND member_id = ?', Number(enabled), team, member);
	redirect(303, `/teams/${team}?ok=saved`);
};
