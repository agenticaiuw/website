import { redirect } from '@sveltejs/kit';
import { createLoginCode, memberForLogin, safeRedirect, sessionMember, shareSession } from '$lib/server/auth';
import { loginEmail } from '$lib/server/emails';
import { isEmail, readForm, str } from '$lib/server/form';
import { sendMail } from '$lib/server/mail';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (e) => {
	if (e.request.method === 'GET' && (await sessionMember(e))) {
		await shareSession(e);
		redirect(302, safeRedirect(e.url.searchParams.get('next')));
	}
	return { title: 'Sign in', next: safeRedirect(e.url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, locals: { env } }) => {
		const form = await readForm(request);
		const email = str(form.email, 200).toLowerCase();
		const next = safeRedirect(str(form.next));
		let devCode: string | null = null;
		if (isEmail(email)) {
			const member = await memberForLogin(env, email);
			const code = member && (await createLoginCode(env, member));
			if (member && code) {
				await sendMail(env, { to: { name: member.name, email: member.email }, kind: 'login', ...loginEmail(member.name, code, env.APP_URL) });
				if (env.DEV_MODE) devCode = code;
			}
		}
		return { title: 'Enter your code', email, next, from: env.MAIL_FROM, devCode };
	}
};
