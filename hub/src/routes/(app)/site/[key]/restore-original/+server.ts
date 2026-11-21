import { error, redirect } from '@sveltejs/kit';
import { execOnly } from '$lib/server/perm';
import { sectionByKey } from '$lib/server/site/schema';
import { defaultsFor, saveSection } from '$lib/server/site/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const section = sectionByKey(params.key);
	if (!section) error(404, 'Not found');
	await saveSection(env.DB, section.key, defaultsFor(section.key), viewer.id, 'Restored the original site text');
	redirect(303, `/site/${section.key}?ok=restored`);
};
