import { error } from '@sveltejs/kit';
import { execOnly } from '$lib/server/perm';
import { loadHistory } from '$lib/server/site/history-page';
import { sectionByKey } from '$lib/server/site/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals: { env, viewer } }) => {
	execOnly(viewer);
	const section = sectionByKey(params.key);
	if (!section) error(404, 'Not found');
	return { ...(await loadHistory(env.DB, url, section)), zone: env.TIMEZONE };
};
