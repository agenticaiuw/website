import { error } from '@sveltejs/kit';

/* One page per team in the hub's Teams section, at /teams/<key>/. */
export const load = async ({ params, parent }) => {
	const { site } = await parent();
	if (!site.work.subteams.items.some((t) => t.k === params.k)) error(404, 'Not found');
	return { k: params.k };
};
