import { redirect } from '@sveltejs/kit';
import { id, readForm, str } from '$lib/server/form';
import { addPerson, addToTeam, teamBack } from '$lib/server/people';
import { isExec } from '$lib/perm';
import { notifyTeamAdded } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	if (!isExec(v)) redirect(303, '/?error=forbidden');
	const teamId = id(params.id);
	const form = await readForm(request);
	// Someone on the roster, or someone new by full name and email.
	const memberId = id(form.member) ?? (str(form.email) ? await addPerson(env.DB, str(form.name), str(form.email)) : null);
	if (!teamId || !memberId) redirect(303, `/teams?error=${str(form.email) && str(form.name) ? 'email' : 'missing'}`);
	if (await addToTeam(env.DB, teamId, memberId, str(form.lead) === '1')) await notifyTeamAdded(env, v, teamId, memberId);
	redirect(303, teamBack(request, teamId));
};
