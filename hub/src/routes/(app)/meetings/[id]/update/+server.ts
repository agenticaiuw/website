import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { readForm, str, withNotice } from '$lib/server/form';
import { meetingTiming } from '$lib/server/meeting-content';
import { loadMeeting } from '$lib/server/meeting-access';
import type { RequestHandler } from './$types';

/** Saves the viewer's written update for a meeting. An empty one takes it back. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const back = `/meetings/${m.id}?view=preparation`;
	if (meetingTiming(m, env.TIMEZONE).ended) redirect(303, withNotice(back, 'error', 'forbidden'));
	const body = str((await readForm(request)).body, 2000);
	if (body)
		await run(
			env.DB,
			`INSERT INTO meeting_updates (meeting_id, member_id, body) VALUES (?, ?, ?)
			 ON CONFLICT (meeting_id, member_id) DO UPDATE SET body = excluded.body, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
			m.id,
			v.id,
			body
		);
	else await run(env.DB, 'DELETE FROM meeting_updates WHERE meeting_id = ? AND member_id = ?', m.id, v.id);
	redirect(303, withNotice(back, 'ok', 'update-saved') + '#updates');
};
