import { loadSite } from '$lib/server/site';

export const load = async ({ platform }) => ({ site: await loadSite(platform) });
