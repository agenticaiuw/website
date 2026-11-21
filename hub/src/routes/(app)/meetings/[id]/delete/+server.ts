import { error, redirect } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { isExec } from '$lib/perm';
import { readForm, str } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import { LATER_IN_SERIES, laterInSeries } from '$lib/server/meetings';
import { announceCanceled, meetingPeople } from '$lib/server/reminders';
import type { Member } from '$lib/types';
import type { RequestHandler } from './$types';

/**
 * Cancels a meeting (or it and the rest of its series): everyone on the upcoming ones is emailed,
 * then they're deleted. Past ones are just deleted.
 */
export const POST: RequestHandler = async ({ params, url, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m || !(isExec(v) || m.created_by === v.id)) error(404, 'Not found');
	const db = env.DB;
	const today = todayIn(env.TIMEZONE);
	const following = url.searchParams.get('following') === '1' && !!m.series_id;
	const later = following ? await laterInSeries(db, m) : [];
	// Everyone on any of the upcoming ones hears about it, once, with the reason.
	const upcoming = [{ id: m.id, date: m.date }, ...later].filter((x) => x.date >= today);
	const reason = str((await readForm(request)).reason, 300);
	if (upcoming.length && !reason) redirect(303, `/meetings/${m.id}/edit?error=reason`);
	const people = new Map<number, Member>();
	for (const x of upcoming) for (const p of await meetingPeople(db, { id: x.id, kind: m.kind })) people.set(p.id, p);
	const stmts = [db.prepare('DELETE FROM meetings WHERE id = ?').bind(m.id)];
	if (following) stmts.push(db.prepare(`DELETE ${LATER_IN_SERIES}`).bind(m.series_id, m.date, m.team_id));
	await db.batch(stmts);
	if (!upcoming.length) redirect(303, '/meetings?ok=deleted');
	const result = await announceCanceled(env, { ...m, date: upcoming[0].date }, [...people.values()], upcoming.slice(1).map((x) => x.date), { reason, by: v.name });
	redirect(303, `/meetings?${result.error ? 'error=unsent' : result.sent ? 'ok=canceled' : 'ok=deleted'}`);
};
