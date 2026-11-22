import { error, fail, redirect } from '@sveltejs/kit';
import { id, readForm, str } from '$lib/server/form';
import { businessOnly } from '$lib/server/perm';
import { sectionByKey, TOKENS } from '$lib/server/site/schema';
import { coerce, history, hubTeams, saveSection, sectionData, withHubTeams } from '$lib/server/site/store';
import { edit } from '$lib/server/site/views';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	businessOnly(viewer);
	const section = sectionByKey(params.key);
	if (!section) error(404, 'Not found');
	const [{ row, data }, recent, teams] = await Promise.all([sectionData(env.DB, section.key), history(env.DB, { section: section.key, limit: 5 }), hubTeams(env.DB)]);
	return {
		title: section.title,
		active: 'site' as const,
		zone: env.TIMEZONE,
		section,
		// Teams saved before they were linked to the hub open already matched by name.
		data: section.key === 'teams' ? withHubTeams(data, teams) : data,
		row: edit(row),
		recent: recent.map(edit),
		teams,
		tokens: TOKENS
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals: { env, viewer } }) => {
		businessOnly(viewer);
		const section = sectionByKey(params.key);
		if (!section) error(404, 'Not found');
		const form = await readForm(request);
		const raw = str(form.data, 400_000);
		const note = str(form.note, 200);
		const base = id(form.base);
		let input: unknown;
		try {
			input = JSON.parse(raw);
		} catch {
			input = null;
		}
		const { row, data: current } = await sectionData(env.DB, section.key);
		const title = section.title;
		if (!input) return fail(400, { title, data: current, errors: ['The editor needs JavaScript turned on to save.'], note: '', stale: undefined, staleShown: false });
		const errors: string[] = [];
		const data = coerce(section.fields, input, errors);
		if (errors.length) return fail(400, { title, data, errors, note, stale: undefined, staleShown: false });
		// Someone else saved while this person was editing: show their work, don't overwrite it silently.
		if ((row?.id ?? null) !== base && str(form.force) !== '1') return fail(400, { title, data, errors: [], note, stale: edit(row), staleShown: true });
		const saved = await saveSection(env.DB, section.key, data, viewer.id, note);
		redirect(303, `/site/${section.key}?ok=${saved ? 'site-saved' : 'site-unchanged'}`);
	}
};
