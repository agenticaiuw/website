import { error, redirect } from '@sveltejs/kit';
import type { Agenda } from '$lib/meetings';
import { first } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { FILE_PART, MEETING_FILE_BUDGET, TOTAL_FILE_BUDGET } from '$lib/server/meeting-content';
import { loadMeeting } from '$lib/server/meeting-access';
import { attachmentFiles, canWrite, tooBig } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

/** Files for an agenda item, or one named file for the library. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const path = `/meetings/${m.id}`;
	if (tooBig(request)) redirect(303, `${path}?error=file#files`);
	const form = await readForm(request);
	const db = env.DB;
	const agenda = id(form.agenda);
	const displayName = str(form.name, 200);
	const item = agenda === null ? null : await first<Agenda>(db, 'SELECT * FROM meeting_agenda WHERE id = ? AND meeting_id = ? AND removed = 0', agenda, m.id);
	if (agenda !== null && !item) error(404, 'Not found');
	if (!canWrite(v, item ? item.author_id : v.id)) error(404, 'Not found');
	if (agenda === null && !displayName) redirect(303, `${path}?error=missing#files`);
	const files = await attachmentFiles(form.file);
	if (!files?.length || (agenda === null && files.length !== 1)) redirect(303, `${path}?error=file#files`);
	const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
	const firstId = crypto.randomUUID();
	const writes: D1PreparedStatement[] = [];
	for (const [index, file] of files.entries()) {
		const fileId = index === 0 ? firstId : crypto.randomUUID();
		writes.push(
			db
				.prepare(
					`INSERT INTO meeting_attachments (id, meeting_id, agenda_id, original_meeting_id, original_agenda_id, author_id, name, media_type, size, created_at, display_name)
		 SELECT ?1, ?2, ?3, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?10 WHERE (?3 IS NULL OR EXISTS (
		 SELECT 1 FROM meeting_agenda WHERE id = ?3 AND meeting_id = ?2 AND removed = 0))
		 AND (?11 = 0 OR EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?12))
		 AND (?11 != 0 OR ((SELECT COALESCE(SUM(size), 0) FROM meeting_attachments WHERE meeting_id = ?2) + ?13 <= ?8
		 AND (SELECT COALESCE(SUM(size), 0) FROM meeting_attachments) + ?13 <= ?9))`
				)
				.bind(fileId, m.id, agenda, v.id, file.name, file.type, file.bytes.byteLength, MEETING_FILE_BUDGET, TOTAL_FILE_BUDGET, displayName || null, index, firstId, total)
		);
		for (let offset = 0; offset < file.bytes.byteLength; offset += FILE_PART) {
			writes.push(
				db
					.prepare(
						`INSERT INTO meeting_attachment_chunks (file_id, part, data)
		 SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM meeting_attachments WHERE id = ?1)`
					)
					.bind(fileId, offset / FILE_PART, file.bytes.slice(offset, offset + FILE_PART))
			);
		}
	}
	const [result] = await db.batch(writes);
	if (result.meta.changes) redirect(303, `${path}?ok=saved#files`);
	const stale = agenda !== null && !(await first(db, 'SELECT 1 FROM meeting_agenda WHERE id = ? AND meeting_id = ? AND removed = 0', agenda, m.id));
	redirect(303, `${path}?error=${stale ? 'stale' : 'file-space'}#files`);
};
