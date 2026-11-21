import { error, redirect } from '@sveltejs/kit';
import { all, first, run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { Actions, PageServerLoad } from './$types';

/**
 * The handbook: the club's current goals, rules and how things run. Every member can read it;
 * execs edit it. Each save is a new version, and older versions stay readable.
 */
type Version = { id: number; body: string; edited_at: string; note: string; name: string | null };

const VERSION_SELECT = `SELECT v.id, v.body, v.edited_at, v.note, m.name FROM handbook_versions v LEFT JOIN members m ON m.id = v.edited_by`;

export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const latest = await first<Version>(db, `${VERSION_SELECT} ORDER BY v.id DESC LIMIT 1`);
	const askedFor = id(url.searchParams.get('v'));
	const shown = askedFor && askedFor !== latest?.id ? await first<Version>(db, `${VERSION_SELECT} WHERE v.id = ?`, askedFor) : latest;
	if (askedFor && !shown) error(404, 'Not found');
	const old = !!shown && shown.id !== latest?.id;
	const exec = isExec(v);
	const history = exec ? await all<Omit<Version, 'body'>>(db, `SELECT v.id, v.edited_at, v.note, m.name FROM handbook_versions v LEFT JOIN members m ON m.id = v.edited_by ORDER BY v.id DESC LIMIT 50`) : [];
	return {
		title: 'Handbook',
		active: 'handbook' as const,
		zone: env.TIMEZONE,
		shown,
		old,
		latestId: latest?.id ?? null,
		// The editor starts from the newest text, and only execs get it.
		latestBody: exec && !old ? (latest?.body ?? '') : '',
		history
	};
};

export const actions: Actions = {
	default: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/handbook?error=forbidden');
		const form = await readForm(request);
		const body = str(form.body, 50000).replace(/\r\n/g, '\n').trim();
		if (!body) redirect(303, '/handbook?error=missing');
		const latest = await first<{ id: number; body: string }>(env.DB, 'SELECT id, body FROM handbook_versions ORDER BY id DESC LIMIT 1');
		if ((latest?.id ?? 0) !== (id(form.base) ?? 0)) redirect(303, '/handbook?error=stale');
		if (latest?.body === body) redirect(303, '/handbook?ok=site-unchanged');
		await run(env.DB, 'INSERT INTO handbook_versions (body, edited_by, note) VALUES (?, ?, ?)', body, v.id, str(form.note, 200));
		redirect(303, '/handbook?ok=saved');
	}
};
