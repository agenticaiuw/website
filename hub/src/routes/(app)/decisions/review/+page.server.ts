import { error, redirect } from '@sveltejs/kit';
import { activeMembers, roster } from '$lib/server/db';
import { dateOrBlank, decision, decisions, saveDecision, type DecisionChange } from '$lib/server/decisions';
import { id, readForm, str } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { Actions, PageServerLoad } from './$types';

/**
 * Deciding one at a time. Shows the first open decision, or the one asked for, and saves each
 * answer the moment it's picked, then moves on to the next open one.
 */
export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	if (!isExec(v)) redirect(303, '/decisions?error=forbidden');
	const list = await decisions(env.DB, true);
	const asked = id(url.searchParams.get('id'));
	const item = asked ? list.find((d) => d.id === asked) : list.find((d) => d.status === 'open');
	if (asked && !item) error(404, 'Not found');
	const at = item ? list.indexOf(item) : -1;
	const openBefore = list.slice(0, Math.max(at, 0)).filter((d) => d.status === 'open');
	const openAfter = list.slice(at + 1).filter((d) => d.status === 'open');
	return {
		title: 'Decide',
		active: 'decisions' as const,
		zone: env.TIMEZONE,
		item: item ?? null,
		position: at + 1,
		total: list.length,
		openCount: list.filter((d) => d.status === 'open').length,
		prevId: openBefore.at(-1)?.id ?? null,
		nextId: openAfter[0]?.id ?? null,
		strip: list.map((d) => ({ id: d.id, status: d.status, label: `${d.area}: ${d.title || d.body || d.context}` })),
		people: roster(await activeMembers(env.DB))
	};
};

export const actions: Actions = {
	default: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/decisions?error=forbidden');
		const form = await readForm(request);
		const d = await decision(env.DB, id(form.id) ?? 0);
		if (!d) error(404, 'Not found');
		const here = `/decisions/review?id=${d.id}`;
		if (str(form.base) !== d.updated_at) redirect(303, `${here}&error=stale`);
		const starts = dateOrBlank(str(form.starts));
		if (starts === null) redirect(303, `${here}&error=date`);
		const choice = str(form.choice);
		const next: DecisionChange = { status: d.status, body: d.body, owner_id: id(form.owner), starts_on: starts };
		if (choice === 'confirm' && d.body) next.status = 'official';
		else if (/^o\d+$/.test(choice) && d.options[Number(choice.slice(1))]) {
			const o = d.options[Number(choice.slice(1))];
			if (o.body === null) next.status = 'dropped';
			else {
				next.status = 'official';
				next.body = o.body;
			}
		} else if (choice === 'change') {
			next.body = str(form.body, 2000).replace(/\s+/g, ' ');
			if (!next.body) redirect(303, `${here}&error=missing`);
			next.status = 'official';
		} else if (choice === 'drop') next.status = 'dropped';
		else if (choice === 'reopen') next.status = 'open';
		else redirect(303, `${here}&error=missing`);
		await saveDecision(env.DB, d, next, v.id);
		if (choice === 'reopen') redirect(303, `${here}&ok=saved`);
		// On to the next open decision after this one, then any earlier one still open.
		const list = await decisions(env.DB, true);
		const at = list.findIndex((x) => x.id === d.id);
		const after = [...list.slice(at + 1), ...list.slice(0, at)].find((x) => x.status === 'open');
		redirect(303, after ? `/decisions/review?id=${after.id}&ok=saved` : '/decisions?ok=saved');
	}
};
