import { error, redirect } from '@sveltejs/kit';
import { first, nowIso, run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { canEdit, canRead, history, latestVersion, pageBySlug, versionById, type KbPage } from '$lib/server/knowledge';
import { isExec } from '$lib/perm';
import type { Viewer } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

/** One Handbook page: read it, see older versions, and (for its editors) change it. */
async function find(db: D1Database, v: Viewer, slug: string) {
	const page = await pageBySlug(db, slug);
	if (!page || !canRead(v, page)) error(404, 'Not found');
	if (page.team_id && !(await first(db, 'SELECT 1 FROM teams WHERE id = ? AND archived = 0', page.team_id))) error(404, 'Not found');
	return page;
}

export const load: PageServerLoad = async ({ params, url, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const page = await find(db, v, params.slug);
	const latest = await latestVersion(db, page.id);
	const askedFor = id(url.searchParams.get('v'));
	const shown = askedFor && askedFor !== latest?.id ? await versionById(db, page.id, askedFor) : latest;
	if (askedFor && !shown) error(404, 'Not found');
	const old = !!shown && shown.id !== latest?.id;
	const editable = await canEdit(db, v, page);
	const team = page.team_id ? await first<{ id: number; name: string }>(db, 'SELECT id, name FROM teams WHERE id = ?', page.team_id) : null;
	return {
		title: page.title,
		active: 'handbook' as const,
		zone: env.TIMEZONE,
		page,
		team,
		shown,
		old,
		latestId: latest?.id ?? null,
		editable,
		// The editor starts from the newest text, and only its editors get it.
		latestBody: editable && !old ? (latest?.body ?? '') : '',
		history: editable ? await history(db, page.id) : []
	};
};

const back = (page: KbPage, q = '') => `/handbook/${page.slug}${q}`;

export const actions: Actions = {
	save: async ({ params, request, locals: { env, viewer: v } }) => {
		const page = await find(env.DB, v, params.slug);
		if (!(await canEdit(env.DB, v, page))) redirect(303, back(page, '?error=forbidden'));
		const form = await readForm(request);
		const body = str(form.body, 100000).replace(/\r\n/g, '\n').trim();
		const latest = await latestVersion(env.DB, page.id);
		if ((latest?.id ?? 0) !== (id(form.base) ?? 0)) redirect(303, back(page, '?edit&error=stale'));
		if ((latest?.body ?? '') === body) redirect(303, back(page, '?ok=site-unchanged'));
		await run(env.DB, 'INSERT INTO kb_versions (page_id, body, edited_by, note) VALUES (?, ?, ?, ?)', page.id, body, v.id, str(form.note, 200));
		redirect(303, back(page, '?ok=saved'));
	},
	settings: async ({ params, request, locals: { env, viewer: v } }) => {
		const page = await find(env.DB, v, params.slug);
		if (!isExec(v)) redirect(303, back(page, '?error=forbidden'));
		const form = await readForm(request);
		const title = str(form.title, 120).trim();
		if (!title) redirect(303, back(page, '?error=missing'));
		const audience = form.audience === 'execs' ? 'execs' : 'members';
		await run(env.DB, 'UPDATE kb_pages SET title = ?, area = ?, audience = ? WHERE id = ?', title, str(form.area, 60).trim(), audience, page.id);
		redirect(303, back(page, '?ok=saved'));
	},
	remove: async ({ params, locals: { env, viewer: v } }) => {
		const page = await find(env.DB, v, params.slug);
		if (!isExec(v)) redirect(303, back(page, '?error=forbidden'));
		await run(env.DB, 'UPDATE kb_pages SET removed_at = ? WHERE id = ?', nowIso(), page.id);
		redirect(303, '/handbook?ok=page-removed');
	}
};
