import { error, redirect } from '@sveltejs/kit';
import { id, readForm } from '$lib/server/form';
import { deleteOutreach, linkHref, outreachById, outreachOptions, readOutreach, saveOutreach } from '$lib/server/outreach';
import { businessOnly } from '$lib/server/perm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	businessOnly(viewer);
	const row = await outreachById(env.DB, id(params.id) ?? 0);
	if (!row) error(404, 'Not found');
	return {
		title: row.organization || row.name,
		active: 'teams' as const,
		row,
		href: linkHref(row.link),
		options: await outreachOptions(env.DB)
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const row = await outreachById(env.DB, id(params.id) ?? 0);
		if (!row) error(404, 'Not found');
		const { values, error: bad } = readOutreach(await readForm(request));
		if (bad) redirect(303, `/outreach/${row.id}?error=${bad}`);
		await saveOutreach(env.DB, row.id, values);
		redirect(303, `/outreach/${row.id}?ok=saved`);
	},
	delete: async ({ params, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const row = await outreachById(env.DB, id(params.id) ?? 0);
		if (!row) error(404, 'Not found');
		await deleteOutreach(env.DB, row.id);
		redirect(303, '/outreach?ok=deleted');
	}
};
