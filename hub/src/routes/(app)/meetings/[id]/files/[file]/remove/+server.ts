import { error, redirect } from '@sveltejs/kit';
import type { Attachment } from '$lib/meetings';
import { first, run } from '$lib/server/db';
import { loadMeeting } from '$lib/server/meeting-access';
import { canWrite } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const db = env.DB;
	const file = await first<Attachment>(db, 'SELECT * FROM meeting_attachments WHERE meeting_id = ? AND id = ? AND removed = 0', m.id, params.file);
	if (!file || !canWrite(v, file.author_id)) error(404, 'Not found');
	await run(db, 'UPDATE meeting_attachments SET removed = 1 WHERE id = ?', file.id);
	redirect(303, `/meetings/${m.id}?ok=saved#files`);
};
