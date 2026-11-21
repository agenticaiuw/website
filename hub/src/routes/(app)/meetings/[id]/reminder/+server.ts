import { error } from '@sveltejs/kit';
import { addDays } from '$lib/dates';
import { canEditMeeting } from '$lib/perm';
import { meetingEmail } from '$lib/server/emails';
import { loadMeeting } from '$lib/server/meeting-access';
import { emailMeeting } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

/** The reminder email as the viewer would get it. */
export const GET: RequestHandler = async ({ params, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m || !canEditMeeting(v, m)) error(404, 'Not found');
	return new Response(meetingEmail(v.name, emailMeeting(m), addDays(m.date, -1), env.APP_URL).html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};
