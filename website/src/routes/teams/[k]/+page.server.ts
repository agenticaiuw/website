import { loadSite } from '$lib/server/site';

/** Every team's page is built, not just the ones the crawler finds a link to. */
export const entries = () => loadSite().work.subteams.items.map((t) => ({ k: t.k }));
