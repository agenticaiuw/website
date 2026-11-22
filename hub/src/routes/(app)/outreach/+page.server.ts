import { error, redirect } from '@sveltejs/kit';
import { readForm } from '$lib/server/form';
import { addOutreach, businessTeamId, readOutreach } from '$lib/server/outreach';
import { businessOnly } from '$lib/server/perm';
import type { Actions, PageServerLoad } from './$types';

/** The contacts list moved to the Business team's page. Old links and filters land there. */
export const load: PageServerLoad = async ({ url, locals: { env, viewer } }) => {
	businessOnly(viewer);
	const team = await businessTeamId(env.DB);
	if (!team) error(404, 'Not found');
	const next = new URLSearchParams();
	for (const [from, to] of [['ok', 'ok'], ['error', 'error'], ['q', 'contact_q'], ['status', 'contact_status'], ['kind', 'contact_kind']])
		if (url.searchParams.get(from)) next.set(to, url.searchParams.get(from)!);
	redirect(303, `/teams/${team}${next.size ? `?${next}` : ''}#contacts`);
};

export const actions: Actions = {
	add: async ({ request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const { values, error } = readOutreach(await readForm(request));
		if (error) redirect(303, `/outreach?error=${error}`);
		const id = await addOutreach(env.DB, values);
		redirect(303, `/outreach/${id}?ok=created`);
	}
};
