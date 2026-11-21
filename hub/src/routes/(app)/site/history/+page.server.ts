import { execOnly } from '$lib/server/perm';
import { loadHistory } from '$lib/server/site/history-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { env, viewer } }) => {
	execOnly(viewer);
	return { ...(await loadHistory(env.DB, url)), zone: env.TIMEZONE };
};
