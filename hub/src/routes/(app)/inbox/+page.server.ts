import { execOnly } from '$lib/server/perm';
import { threadList } from '$lib/server/inbox';
import type { PageServerLoad } from './$types';

/** Email sent to the club's addresses, newest conversation first. */
export const load: PageServerLoad = async ({ url, locals: { env, viewer } }) => {
	execOnly(viewer);
	const show = url.searchParams.get('show') === 'done' ? 'done' : 'open';
	return { title: 'Inbox', active: 'inbox' as const, zone: env.TIMEZONE, show, address: env.MAIL_FROM, threads: await threadList(env.DB, show) };
};
