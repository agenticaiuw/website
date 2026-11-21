import { redirect } from '@sveltejs/kit';
import { id, readForm, str } from '$lib/server/form';
import { addPerson, addToTeam } from '$lib/server/people';
import { isExec } from '$lib/perm';
import { notifyTeamAdded } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

/** One person by full name and email, optionally straight onto a team. */
export const POST: RequestHandler = async ({ request, locals: { env, viewer: v } }) => {
	if (!isExec(v)) redirect(303, '/?error=forbidden');
	const form = await readForm(request);
	const memberId = await addPerson(env.DB, str(form.name), str(form.email));
	if (!memberId) redirect(303, str(form.name) && str(form.email) ? '/people?error=email' : '/people?error=missing');
	const teamId = id(form.team);
	if (teamId && (await addToTeam(env.DB, teamId, memberId))) await notifyTeamAdded(env, v, teamId, memberId);
	redirect(303, '/people?ok=imported');
};
