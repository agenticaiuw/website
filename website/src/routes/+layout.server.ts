import { loadSite } from '$lib/server/site';

export const load = () => ({ site: loadSite() });
