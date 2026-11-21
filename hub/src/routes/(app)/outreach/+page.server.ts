import { redirect } from '@sveltejs/kit';
import { readForm, str } from '$lib/server/form';
import { addOutreach, listOutreach, outreachOptions, readOutreach } from '$lib/server/outreach';
import { execOnly } from '$lib/server/perm';
import type { Actions, PageServerLoad } from './$types';

/** Exec-only: people and organizations outside the club. Never part of the newsletter list. */
export const load: PageServerLoad = async ({ url, locals: { env, viewer } }) => {
	execOnly(viewer);
	const filter = {
		q: str(url.searchParams.get('q'), 100),
		status: str(url.searchParams.get('status'), 80),
		kind: str(url.searchParams.get('kind'), 80)
	};
	const [rows, options, total] = await Promise.all([listOutreach(env.DB, filter), outreachOptions(env.DB), env.DB.prepare('SELECT COUNT(*) AS n FROM outreach').first<number>('n')]);
	return {
		title: 'Outreach',
		active: 'outreach' as const,
		filter,
		options,
		total: total ?? 0,
		rows: rows.map((r) => ({
			id: r.id,
			name: r.name,
			organization: r.organization,
			kind: r.kind,
			email: r.email,
			owner: r.owner,
			status: r.status,
			priority: r.priority
		}))
	};
};

export const actions: Actions = {
	add: async ({ request, locals: { env, viewer } }) => {
		execOnly(viewer);
		const { values, error } = readOutreach(await readForm(request));
		if (error) redirect(303, `/outreach?error=${error}`);
		const id = await addOutreach(env.DB, values);
		redirect(303, `/outreach/${id}?ok=created`);
	}
};
