import { redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { teamBack } from '$lib/server/people';
import { loadTeamPage } from '$lib/server/team-page';
import { isExec } from '$lib/perm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, locals: { env, viewer } }) => loadTeamPage(env, viewer, url, params.id);

export const actions: Actions = {
	// Team settings from the Teams page: name, who sees it, archived.
	default: async ({ params, request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/?error=forbidden');
		const teamId = id(params.id);
		const form = await readForm(request);
		const name = str(form.name, 100);
		if (!teamId || !name) redirect(303, '/teams?error=missing');
		await run(env.DB, 'UPDATE teams SET name = ?, kind = ?, archived = ? WHERE id = ?', name, str(form.kind) === 'exec' ? 'exec' : 'project', str(form.archived) === '1' ? 1 : 0, teamId);
		redirect(303, teamBack(request, teamId));
	}
};
