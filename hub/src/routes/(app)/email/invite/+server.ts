import { redirect } from '@sveltejs/kit';
import { execOnly, inviteList } from '$lib/server/email-admin';
import { inviteEmail } from '$lib/server/emails';
import { sendMails, type Mail } from '$lib/server/mail';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { env, viewer } }) => {
	execOnly(viewer);
	const mails: Mail[] = (await inviteList(env.DB)).map((member) => ({
		to: { name: member.name, email: member.email },
		kind: 'invite',
		...inviteEmail(member, env.APP_URL)
	}));
	await sendMails(env, mails);
	redirect(303, '/email?ok=invited');
};
