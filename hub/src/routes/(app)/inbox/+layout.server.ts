import { threadById, threadList } from '$lib/server/inbox';
import { execOnly } from '$lib/server/perm';
import type { LayoutServerLoad } from './$types';

/** The message list beside every Inbox page, as in Outlook: open or done conversations, newest first. An open conversation shows the list it's in. */
export const load: LayoutServerLoad = async ({ url, params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const id = params.id && /^[0-9]+$/.test(params.id) ? Number(params.id) : null;
	const thread = id ? await threadById(env.DB, id) : null;
	const show: 'open' | 'done' = thread ? thread.status : url.searchParams.get('show') === 'done' ? 'done' : 'open';
	return { show, zone: env.TIMEZONE, address: env.MAIL_FROM, threads: await threadList(env.DB, show) };
};
