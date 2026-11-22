import { businessOnly } from '$lib/server/perm';
import { PAGES, SECTIONS } from '$lib/server/site/schema';
import { latestRows } from '$lib/server/site/store';
import { edit } from '$lib/server/site/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { env, viewer } }) => {
	businessOnly(viewer);
	const latest = await latestRows(env.DB);
	return {
		title: 'Website',
		active: 'site' as const,
		zone: env.TIMEZONE,
		pages: PAGES.map((page) => ({ page, sections: SECTIONS.filter((s) => s.page === page).map((s) => ({ key: s.key, title: s.title, where: s.where, edited: edit(latest.get(s.key)) })) }))
	};
};
