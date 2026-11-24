import { redirect } from '@sveltejs/kit';
import { all, run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { createPage, pagesFor, type Audience } from '$lib/server/knowledge';
import { canRunBusiness, isExec } from '$lib/perm';
import type { Actions, PageServerLoad } from './$types';

/**
 * The Handbook: every page the club keeps (culture, expectations, how we work, each team,
 * meetings, money, decisions), grouped by section. Execs add pages; each page has its own editor.
 */
export const load: PageServerLoad = async ({ locals: { env, viewer: v } }) => {
	const pages = await pagesFor(env.DB, v);
	const areas: { name: string; pages: typeof pages }[] = [];
	for (const p of pages) {
		const name = p.area || 'Other';
		let area = areas.find((a) => a.name === name);
		if (!area) areas.push((area = { name, pages: [] }));
		area.pages.push(p);
	}
	const exec = isExec(v);
	return {
		title: 'Handbook',
		active: 'handbook' as const,
		zone: env.TIMEZONE,
		areas,
		website: canRunBusiness(v),
		removed: exec ? await all<{ id: number; title: string; removed_at: string }>(env.DB, `SELECT id, title, removed_at FROM kb_pages WHERE removed_at != '' ORDER BY removed_at DESC`) : []
	};
};

export const actions: Actions = {
	create: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/handbook?error=forbidden');
		const form = await readForm(request);
		const title = str(form.title, 120).trim();
		if (!title) redirect(303, '/handbook?error=missing');
		const audience: Audience = form.audience === 'execs' ? 'execs' : 'members';
		const slug = await createPage(env.DB, v, { title, area: str(form.area, 60).trim(), audience });
		redirect(303, `/handbook/${slug}?edit`);
	},
	restore: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/handbook?error=forbidden');
		const page = id((await readForm(request)).id);
		if (page) await run(env.DB, `UPDATE kb_pages SET removed_at = '' WHERE id = ?`, page);
		redirect(303, '/handbook?ok=page-restored');
	}
};
