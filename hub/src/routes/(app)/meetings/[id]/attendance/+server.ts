import { error, redirect } from '@sveltejs/kit';
import { STATUSES } from '$lib/meetings';
import { canEditMeeting } from '$lib/perm';
import { id, readForm, str } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import type { AttendanceStatus } from '$lib/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m || !canEditMeeting(v, m)) error(404, 'Not found');
	const form = await readForm(request);
	const valid = new Set(STATUSES.map(([s]) => s));
	const stmts: D1PreparedStatement[] = [];
	const upsert = (memberId: number, status: string) =>
		env.DB.prepare('INSERT INTO attendance (meeting_id, member_id, status) VALUES (?, ?, ?) ON CONFLICT(meeting_id, member_id) DO UPDATE SET status = excluded.status, self_report = 0').bind(m.id, memberId, status);
	for (const [key, value] of Object.entries(form)) {
		const memberId = key.startsWith('att_') ? id(key.slice(4)) : null;
		const status = str(value);
		if (memberId && valid.has(status as AttendanceStatus)) stmts.push(upsert(memberId, status));
	}
	const added = id(form.add);
	if (added) stmts.push(upsert(added, 'present'));
	if (stmts.length) await env.DB.batch(stmts);
	redirect(303, `/meetings/${m.id}?view=attendance&ok=attendance`);
};
