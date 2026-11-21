import { error } from '@sveltejs/kit';
import type { Attachment } from '$lib/meetings';
import { all, first } from '$lib/server/db';
import { loadMeeting } from '$lib/server/meeting-access';
import type { RequestHandler } from './$types';

/** Downloads a meeting file, put back together from its chunks. Audio can also play in the page. */
export const GET: RequestHandler = async ({ params, url, locals: { env, viewer } }) => {
	const m = await loadMeeting(env, viewer, params.id);
	if (!m) error(404, 'Not found');
	const db = env.DB;
	const file = await first<Attachment>(db, 'SELECT * FROM meeting_attachments WHERE meeting_id = ? AND id = ? AND removed = 0', m.id, params.file);
	if (!file) error(404, 'Not found');
	const chunks = await all<{ data: number[] }>(db, 'SELECT data FROM meeting_attachment_chunks WHERE file_id = ? ORDER BY part', file.id);
	const bytes = new Uint8Array(file.size);
	let offset = 0;
	for (const { data } of chunks) {
		bytes.set(data, offset);
		offset += data.length;
	}
	if (offset !== file.size) return new Response('File unavailable.', { status: 500 });
	const inline = url.searchParams.get('play') === '1' && file.media_type.startsWith('audio/');
	const filename = encodeURIComponent(file.name).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));
	return new Response(bytes.buffer, {
		headers: {
			'Content-Type': file.media_type,
			'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
			'Content-Security-Policy': "sandbox; default-src 'none'"
		}
	});
};
