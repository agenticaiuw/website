import { error } from '@sveltejs/kit';
import { responsesFor } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	const data = await responsesFor(env, viewer, params.id);
	if (!data) error(404, 'Not found');
	const { m, f, questions, rows } = data;
	// Quote every cell, and keep spreadsheet apps from running an answer that starts like a formula.
	const cell = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
	const lines = [['Name', 'Email', ...questions.map((q) => q.label), 'Sent'], ...rows.map((r) => [r.name, r.email, ...questions.map((q) => r.a[q.id] ?? ''), r.updated_at])].map((cells) =>
		cells.map(cell).join(',')
	);
	const filename = `${m.date} ${m.title} ${f.title}`.replace(/[^\w -]+/g, '').trim() + '.csv';
	return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
};
