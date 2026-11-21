import { error } from '@sveltejs/kit';
import { id } from '$lib/server/form';
import { execOnly } from '$lib/server/perm';
import { sectionByKey } from '$lib/server/site/schema';
import { latestRows, teamNames, versionById } from '$lib/server/site/store';
import { changesOf } from '$lib/server/site/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const v = await versionById(env.DB, id(params.id) ?? 0);
	const section = v && sectionByKey(v.section);
	if (!v || !section) error(404, 'Not found');
	const [latest, teams] = await Promise.all([latestRows(env.DB), teamNames(env.DB)]);
	return {
		title: `Version ${v.id}`,
		active: 'site' as const,
		zone: env.TIMEZONE,
		section: { key: section.key, title: section.title },
		version: { id: v.id, name: v.name, edited_at: v.edited_at, restored_from: v.restored_from, note: v.note },
		live: latest.get(v.section)?.id === v.id,
		changes: changesOf(v, teams)
	};
};
