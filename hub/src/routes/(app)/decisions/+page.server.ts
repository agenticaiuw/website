import { redirect } from '@sveltejs/kit';
import { activeMembers, roster } from '$lib/server/db';
import { addDecision, byArea, dateOrBlank, decisions, STATUSES, type DecisionStatus } from '$lib/server/decisions';
import { id, readForm, str } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { Actions, PageServerLoad } from './$types';

/** The rulebook: every official decision. Execs also see the open and dropped ones, and add new ones. */
export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	const exec = isExec(v);
	const list = await decisions(env.DB, exec);
	const asked = url.searchParams.get('show') as DecisionStatus | null;
	const show: DecisionStatus = exec && asked && STATUSES.includes(asked) ? asked : 'official';
	const counts = Object.fromEntries(STATUSES.map((s) => [s, list.filter((d) => d.status === s).length])) as Record<DecisionStatus, number>;
	return {
		title: 'Decisions',
		active: 'decisions' as const,
		zone: env.TIMEZONE,
		show,
		counts,
		groups: byArea(list.filter((d) => d.status === show)),
		areas: [...new Set(list.map((d) => d.area).filter(Boolean))],
		people: exec ? roster(await activeMembers(env.DB)) : []
	};
};

export const actions: Actions = {
	add: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/decisions?error=forbidden');
		const form = await readForm(request);
		const body = str(form.body, 2000);
		const area = str(form.area, 80);
		if (!body || !area) redirect(303, '/decisions?error=missing');
		const starts = dateOrBlank(str(form.starts));
		if (starts === null) redirect(303, '/decisions?error=date');
		const status: DecisionStatus = str(form.status) === 'open' ? 'open' : 'official';
		await addDecision(env.DB, { area, title: str(form.title, 120), body, status, owner_id: id(form.owner), starts_on: starts, exec_only: str(form.visible) === 'execs' }, v.id);
		redirect(303, `/decisions${status === 'open' ? '?show=open&' : '?'}ok=saved`);
	}
};
