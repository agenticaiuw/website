import { error } from '@sveltejs/kit';
import { responsesFor } from '$lib/server/meetings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	const data = await responsesFor(env, viewer, params.id);
	if (!data) error(404, 'Not found');
	const { m, f, questions, rows } = data;
	const ratings = questions
		.filter((q) => q.kind === 'rating')
		.map((q) => {
			const values = rows.map((r) => Number(r.a[q.id])).filter((n) => n >= 1 && n <= 5);
			return { q, n: values.length, avg: values.length ? values.reduce((s, x) => s + x, 0) / values.length : 0 };
		});
	return {
		title: `${f.title}: responses`,
		active: 'meetings' as const,
		zone: env.TIMEZONE,
		meeting: { id: m.id, title: m.title },
		formTitle: f.title,
		questions,
		ratings,
		rows: rows.map(({ id, name, email, a, updated_at }) => ({ id, name, email, a, updated_at }))
	};
};
