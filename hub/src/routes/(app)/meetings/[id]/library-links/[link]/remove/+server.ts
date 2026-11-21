import { error, redirect } from '@sveltejs/kit';
import { first, run } from '$lib/server/db';
import { loadMeeting } from '$lib/server/meeting-access';
import { canWrite } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	const meeting = await loadMeeting(env, viewer, params.id);
	if (!meeting) error(404, 'Not found');
	const link = await first<{ author_id: number | null }>(env.DB, 'SELECT author_id FROM meeting_library_links WHERE id = ? AND meeting_id = ? AND removed = 0', params.link, meeting.id);
	if (!link || !canWrite(viewer, link.author_id)) error(404, 'Not found');
	await run(env.DB, 'UPDATE meeting_library_links SET removed = 1 WHERE id = ? AND meeting_id = ?', params.link, meeting.id);
	redirect(303, `/meetings/${meeting.id}?ok=deleted#files`);
};
