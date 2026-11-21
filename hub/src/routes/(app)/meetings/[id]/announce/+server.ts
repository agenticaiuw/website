import { error, redirect } from '@sveltejs/kit';
import { formatDate, todayIn } from '$lib/dates';
import { canEditMeeting } from '$lib/perm';
import { loadMeeting } from '$lib/server/meeting-access';
import { cadence, laterInSeries } from '$lib/server/meetings';
import { announceMeeting } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

/** Emails everyone on an upcoming meeting about it, with how it repeats if it's part of a series. */
export const POST: RequestHandler = async ({ params, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m || !canEditMeeting(v, m)) error(404, 'Not found');
	const later = await laterInSeries(env.DB, m);
	const today = todayIn(env.TIMEZONE);
	const repeats = later.length ? `It repeats every ${cadence(m.date, later) === 14 ? '2 weeks' : 'week'} until ${formatDate(later[later.length - 1].date, today)}.` : undefined;
	const result = await announceMeeting(env, m, { repeats });
	redirect(303, `/meetings/${m.id}?${result.error ? 'error=unsent' : 'ok=announced'}`);
};
