import { fail, redirect } from '@sveltejs/kit';
import { safeRedirect, startSession, useLoginCode } from '$lib/server/auth';
import { readForm, str } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

// Only the code form posts here; anyone landing on it goes back to sign-in.
export const load: PageServerLoad = ({ request }) => {
	if (request.method === 'GET') redirect(302, '/login');
	return { title: 'Enter your code' };
};

export const actions: Actions = {
	default: async (e) => {
		const env = e.locals.env;
		const form = await readForm(e.request);
		const email = str(form.email, 200).toLowerCase();
		const next = safeRedirect(str(form.next));
		const member = await useLoginCode(env, email, str(form.code, 20).replace(/\s/g, ''));
		if (!member) {
			return fail(400, { title: 'Enter your code', email, next, from: env.MAIL_FROM, error: 'That code is wrong or has expired. Check your latest email, or send a new code.' });
		}
		await startSession(e, member.id);
		redirect(303, next);
	}
};
