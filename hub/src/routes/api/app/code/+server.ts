import { json } from '@sveltejs/kit';
import { body } from '$lib/server/app-api';
import { createLoginCode, memberForLogin } from '$lib/server/auth';
import { loginEmail } from '$lib/server/emails';
import { isEmail, str } from '$lib/server/form';
import { sendMail } from '$lib/server/mail';

// Sends a sign-in code. The answer is the same whether or not the email is on the roster.
export async function POST({ request, locals }) {
	const env = locals.env;
	const email = str((await body(request)).email, 200).toLowerCase();
	let devCode: string | undefined;
	if (isEmail(email)) {
		const member = await memberForLogin(env, email);
		const code = member && (await createLoginCode(env, member));
		if (member && code) {
			await sendMail(env, { to: { name: member.name, email: member.email }, kind: 'login', ...loginEmail(member.name, code, env.APP_URL) });
			if (env.DEV_MODE) devCode = code;
		}
	}
	return json({ ok: true, ...(devCode ? { dev_code: devCode } : {}) });
}
