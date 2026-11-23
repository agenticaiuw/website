import { redirect } from '@sveltejs/kit';
import { id, readForm, str } from '$lib/server/form';
import { addSignup, joinTeams } from '$lib/server/signups';
import type { Actions, PageServerLoad } from './$types';

// The team sign-up form. Anyone with the link can open it.
export const load: PageServerLoad = async ({ url, locals: { env } }) => ({
	title: 'Join a team',
	teams: await joinTeams(env.DB),
	error: url.searchParams.get('error') === 'busy' ? 'busy' : url.searchParams.get('error') ? 'missing' : ''
});

export const actions: Actions = {
	default: async ({ request, locals: { env } }) => {
		const form = await readForm(request);
		const name = str(form.name, 100).replace(/\s+/g, ' ');
		// A hidden field people never see; bots that fill every field get sent back to the form.
		if (str(form.website, 200)) redirect(303, '/join');
		const result = await addSignup(env.DB, name, str(form.major, 200), id(form.team));
		if ('error' in result) redirect(303, `/join?error=${result.error}`);
		return { title: 'Thanks', thanks: name.split(' ')[0], ...result };
	}
};
