import { error, redirect } from '@sveltejs/kit';
import { readForm, str } from '$lib/server/form';
import { FILE_PART, MEETING_FILE_BUDGET, meetingTiming, TOTAL_FILE_BUDGET } from '$lib/server/meeting-content';
import { loadMeeting } from '$lib/server/meeting-access';
import { attachmentFiles, tooBig } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

/** A new agenda item, with speaker notes and attachments if given. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const path = `/meetings/${m.id}`;
	if (tooBig(request)) redirect(303, `${path}?error=file#agenda`);
	const form = await readForm(request);
	const title = str(form.title, 200);
	const durationText = str(form.duration_minutes);
	const duration = Number(durationText);
	const notes = str(form.notes, 10000);
	if (!title) redirect(303, `${path}?error=missing#agenda`);
	if (meetingTiming(m, env.TIMEZONE).ended) redirect(303, `${path}?error=forbidden#agenda`);
	if (!/^\d+$/.test(durationText) || !Number.isInteger(duration) || duration < 1 || duration > 1440) redirect(303, `${path}?error=duration#agenda`);
	const db = env.DB;
	const files = await attachmentFiles(form.file);
	if (!files) redirect(303, `${path}?error=file#agenda`);
	if (files.length) {
		const [{ name, bytes, type }] = files;
		const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
		const fileId = crypto.randomUUID();
		// One transaction saves the file, agenda and notes together. A full storage
		// budget creates none of them, so retrying cannot leave a partial agenda.
		const writes = [
			db
				.prepare(
					`INSERT INTO meeting_attachments (id, meeting_id, original_meeting_id, author_id, name, media_type, size, created_at)
			 SELECT ?1, ?2, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			 WHERE (SELECT COALESCE(SUM(size), 0) FROM meeting_attachments WHERE meeting_id = ?2) + ?9 <= ?7
			 AND (SELECT COALESCE(SUM(size), 0) FROM meeting_attachments) + ?9 <= ?8`
				)
				.bind(fileId, m.id, v.id, name, type, bytes.byteLength, MEETING_FILE_BUDGET, TOTAL_FILE_BUDGET, total),
			db
				.prepare(
					`INSERT INTO meeting_agenda (meeting_id, author_id, author_name, title, position, duration_minutes)
			 SELECT ?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(position), 0) + 1 FROM meeting_agenda WHERE meeting_id = ?1), ?6
			 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?5)`
				)
				.bind(m.id, v.id, v.name, title, fileId, duration),
			db.prepare('UPDATE meeting_attachments SET agenda_id = last_insert_rowid(), original_agenda_id = last_insert_rowid() WHERE id = ?').bind(fileId)
		];
		if (notes)
			writes.push(
				db
					.prepare(
						`INSERT INTO meeting_speaker_notes (meeting_id, agenda_id, body)
		 SELECT meeting_id, agenda_id, ? FROM meeting_attachments WHERE id = ?`
					)
					.bind(notes, fileId)
			);
		for (let offset = 0; offset < bytes.byteLength; offset += FILE_PART) {
			writes.push(
				db
					.prepare(
						`INSERT INTO meeting_attachment_chunks (file_id, part, data)
			 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?1)`
					)
					.bind(fileId, offset / FILE_PART, bytes.slice(offset, offset + FILE_PART))
			);
		}
		for (const file of files.slice(1)) {
			const nextId = crypto.randomUUID();
			writes.push(
				db
					.prepare(
						`INSERT INTO meeting_attachments (id, meeting_id, agenda_id, original_meeting_id, original_agenda_id, author_id, name, media_type, size, created_at)
			 SELECT ?1, meeting_id, agenda_id, original_meeting_id, original_agenda_id, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM meeting_attachments WHERE id = ?6`
					)
					.bind(nextId, v.id, file.name, file.type, file.bytes.byteLength, fileId)
			);
			for (let offset = 0; offset < file.bytes.byteLength; offset += FILE_PART) {
				writes.push(
					db
						.prepare(
							`INSERT INTO meeting_attachment_chunks (file_id, part, data)
				 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?1)`
						)
						.bind(nextId, offset / FILE_PART, file.bytes.slice(offset, offset + FILE_PART))
				);
			}
		}
		const [saved] = await db.batch(writes);
		redirect(303, `${path}?${saved.meta.changes ? 'ok=created' : 'error=file-space'}#agenda`);
	}
	const insert = db
		.prepare(
			`INSERT INTO meeting_agenda (meeting_id, author_id, author_name, title, position, duration_minutes)
	 SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(position), 0) + 1, ?5 FROM meeting_agenda WHERE meeting_id = ?1`
		)
		.bind(m.id, v.id, v.name, title, duration);
	if (notes) {
		await db.batch([insert, db.prepare('INSERT INTO meeting_speaker_notes (meeting_id, agenda_id, body) VALUES (?, last_insert_rowid(), ?)').bind(m.id, notes)]);
	} else {
		await insert.run();
	}
	redirect(303, `${path}?ok=created#agenda`);
};
