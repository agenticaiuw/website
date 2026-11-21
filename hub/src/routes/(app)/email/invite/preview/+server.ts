import { error } from '@sveltejs/kit';
import { execOnly, inviteList } from '$lib/server/email-admin';
import { inviteEmail } from '$lib/server/emails';
import { id } from '$lib/server/form';
import type { RequestHandler } from './$types';

// ?member=ID shows what someone else will get.
export const GET: RequestHandler = async ({ url, locals: { env, viewer } }) => {
	execOnly(viewer);
	const [member] = await inviteList(env.DB, id(url.searchParams.get('member')) ?? viewer.id);
	if (!member) error(404, 'Not found');
	return new Response(inviteEmail(member, env.APP_URL).html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
