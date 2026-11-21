import { error, redirect } from '@sveltejs/kit';
import { id } from '$lib/server/form';
import { execOnly } from '$lib/server/perm';
import { sectionByKey } from '$lib/server/site/schema';
import { coerce, defaultsFor, saveSection, versionById } from '$lib/server/site/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	execOnly(viewer);
	const section = sectionByKey(params.key);
	const v = await versionById(env.DB, id(params.id) ?? 0);
	if (!section || !v || v.section !== section.key) error(404, 'Not found');
	const errors: string[] = [];
	const data = coerce(section.fields, { ...defaultsFor(section.key), ...JSON.parse(v.data) }, errors);
	await saveSection(env.DB, section.key, data, viewer.id, `Restored version ${v.id}`, v.id);
	redirect(303, `/site/${section.key}?ok=restored`);
};
