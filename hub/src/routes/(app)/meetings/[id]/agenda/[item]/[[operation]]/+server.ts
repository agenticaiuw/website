import { error, redirect } from '@sveltejs/kit';
import type { Agenda } from '$lib/meetings';
import { canEditMeeting } from '$lib/perm';
import { first, run } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import { canWrite } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

/** Edits an agenda item: its title and length, its notes (/notes), its place (/up), or removes it (/remove). */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const db = env.DB;
	const item = await first<Agenda>(db, 'SELECT * FROM meeting_agenda WHERE meeting_id = ? AND id = ? AND removed = 0', m.id, id(params.item));
	if (!item || !canWrite(v, item.author_id)) error(404, 'Not found');
	const form = await readForm(request);
	const path = `/meetings/${m.id}`;
	const version = Number(str(form.version));
	const operation = params.operation;
	let result;
	if (operation === 'notes') {
		const notes = str(form.notes, 10000);
		if (version === 0 && !notes) redirect(303, `${path}#agenda`);
		result =
			version === 0
				? await run(
						db,
						`INSERT INTO meeting_speaker_notes (meeting_id, agenda_id, body)
			 SELECT meeting_id, id, ? FROM meeting_agenda WHERE id = ? AND removed = 0
			 ON CONFLICT(agenda_id) DO NOTHING`,
						notes,
						item.id
					)
				: notes
					? await run(
							db,
							`UPDATE meeting_speaker_notes SET body = ?, version = version + 1
				 WHERE agenda_id = ? AND version = ? AND EXISTS (SELECT 1 FROM meeting_agenda WHERE id = ? AND removed = 0)`,
							notes,
							item.id,
							version,
							item.id
						)
					: await run(
							db,
							`DELETE FROM meeting_speaker_notes WHERE agenda_id = ? AND version = ?
				 AND EXISTS (SELECT 1 FROM meeting_agenda WHERE id = ? AND removed = 0)`,
							item.id,
							version,
							item.id
						);
	} else if (operation === 'up') {
		if (!canEditMeeting(v, m)) error(404, 'Not found');
		// Both positions change in one statement. The selected item's version gates the swap.
		result = await run(
			db,
			`WITH pair AS MATERIALIZED (
		 SELECT a.id AS current, a.position AS current_pos, b.id AS previous, b.position AS previous_pos
		 FROM meeting_agenda a JOIN meeting_agenda b ON b.id = (
			SELECT id FROM meeting_agenda WHERE meeting_id = a.meeting_id AND removed = 0
			AND position < a.position ORDER BY position DESC LIMIT 1
		 ) WHERE a.id = ? AND a.version = ? AND a.removed = 0
		) UPDATE meeting_agenda SET position = CASE WHEN id = (SELECT current FROM pair)
		 THEN (SELECT previous_pos FROM pair) ELSE (SELECT current_pos FROM pair) END, version = version + 1
		 WHERE id IN (SELECT current FROM pair UNION ALL SELECT previous FROM pair)`,
			item.id,
			version
		);
	} else if (operation === 'remove') {
		result = await run(db, 'UPDATE meeting_agenda SET removed = 1, version = version + 1 WHERE id = ? AND version = ? AND removed = 0', item.id, version);
	} else if (!operation) {
		const title = str(form.title, 200);
		const durationText = str(form.duration_minutes);
		const duration = Number(durationText);
		if (!title) redirect(303, `${path}?error=missing#agenda`);
		if (!/^\d+$/.test(durationText) || !Number.isInteger(duration) || duration < 1 || duration > 1440) redirect(303, `${path}?error=duration#agenda`);
		result = await run(db, 'UPDATE meeting_agenda SET title = ?, duration_minutes = ?, version = version + 1 WHERE id = ? AND version = ? AND removed = 0', title, duration, item.id, version);
	} else {
		error(404, 'Not found');
	}
	redirect(303, `${path}?${result.meta.changes ? 'ok=saved' : 'error=stale'}#agenda`);
};
