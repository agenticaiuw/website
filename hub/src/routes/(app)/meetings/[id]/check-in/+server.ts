import { error, redirect } from '@sveltejs/kit';
import { MEETING_EXPECTED, run } from '$lib/server/db';
import { readForm, str } from '$lib/server/form';
import { meetingTiming } from '$lib/server/meeting-content';
import { loadMeeting } from '$lib/server/meeting-access';
import type { RequestHandler } from './$types';

/** Members mark themselves here or partly here while a meeting is on. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const form = await readForm(request);
	const status = str(form.status);
	const timing = meetingTiming(m, env.TIMEZONE);
	const path = `/meetings/${m.id}`;
	if (!timing.started || timing.ended || (status !== 'present' && status !== 'late')) redirect(303, `${path}?error=forbidden`);
	const result = await run(
		env.DB,
		`INSERT INTO attendance (meeting_id, member_id, status, self_report)
	 SELECT ?1, mb.id, ?4, 1 FROM members mb WHERE mb.id = ?3 AND mb.active = 1
	 AND (?2 = 'event' OR ${MEETING_EXPECTED})
	 ON CONFLICT(meeting_id, member_id) DO UPDATE SET status = excluded.status
	 WHERE attendance.self_report = 1`,
		m.id,
		m.kind,
		v.id,
		status
	);
	redirect(303, `${path}?view=attendance&${result.meta.changes ? 'ok=attendance' : 'error=forbidden'}`);
};
