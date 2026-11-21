import { error, redirect } from '@sveltejs/kit';
import { readForm, str } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import type { RequestHandler } from './$types';

/** Adds to the meeting summary, or edits one contribution. Every edit is kept as a new version. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer } }) => {
	const m = await loadMeeting(env, viewer, params.id);
	if (!m) error(404, 'Not found');
	const root = `/meetings/${m.id}?view=follow-up`;
	const form = await readForm(request);
	const raw = form.body;
	if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 10000) redirect(303, `${root}&error=summary#summary`);
	const body = raw.trim();
	const entry = params.entry;
	if (!entry) {
		await env.DB.prepare(
			`INSERT INTO meeting_summary_revisions (meeting_id, entry_id, version, body, author_id, author_name)
		 VALUES (?, ?, 1, ?, ?, ?)`
		)
			.bind(m.id, crypto.randomUUID(), body, viewer.id, viewer.name)
			.run();
		redirect(303, `${root}&ok=created#summary`);
	}
	const version = Number(str(form.version));
	if (!Number.isSafeInteger(version) || version < 1) redirect(303, `${root}&error=stale#summary`);
	const saved = await env.DB.prepare(
		`INSERT INTO meeting_summary_revisions (meeting_id, entry_id, version, body, author_id, author_name)
	 SELECT meeting_id, entry_id, version + 1, ?1, ?2, ?3 FROM meeting_summary_revisions r
	 WHERE meeting_id = ?4 AND entry_id = ?5 AND version = ?6
	 AND NOT EXISTS (SELECT 1 FROM meeting_summary_revisions newer WHERE newer.entry_id = r.entry_id AND newer.version > r.version)
	 ON CONFLICT(entry_id, version) DO NOTHING`
	)
		.bind(body, viewer.id, viewer.name, m.id, entry, version)
		.run();
	redirect(303, `${root}&${saved.meta.changes ? 'ok=saved' : 'error=stale'}#summary`);
};
