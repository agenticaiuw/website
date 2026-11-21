import { redirect } from '@sveltejs/kit';
import { execOnly } from '$lib/server/email-admin';
import { testEmail } from '$lib/server/emails';
import { sendMail } from '$lib/server/mail';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { env, viewer: v } }) => {
	execOnly(v);
	await sendMail(env, { to: { name: v.name, email: v.email }, kind: 'test', ...testEmail(v.name, env.APP_URL) });
	redirect(303, '/email?ok=test');
};
