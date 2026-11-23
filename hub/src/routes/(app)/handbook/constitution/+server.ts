import { error } from '@sveltejs/kit';
import { all, first } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** The club constitution, for any signed-in member to download, put back together from its chunks. */
export const GET: RequestHandler = async ({ locals: { env } }) => {
	const db = env.DB;
	const file = await first<{ name: string; media_type: string; size: number }>(db, "SELECT name, media_type, size FROM club_files WHERE key = 'constitution' AND removed_at = ''");
	if (!file) error(404, 'Not found');
	const chunks = await all<{ data: number[] }>(db, "SELECT data FROM club_file_chunks WHERE file_key = 'constitution' ORDER BY part");
	const bytes = new Uint8Array(file.size);
	let offset = 0;
	for (const { data } of chunks) {
		bytes.set(data, offset);
		offset += data.length;
	}
	if (offset !== file.size) return new Response('File unavailable.', { status: 500 });
	const filename = encodeURIComponent(file.name).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16));
	return new Response(bytes.buffer, {
		headers: {
			'Content-Type': file.media_type,
			'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
			'Content-Security-Policy': "sandbox; default-src 'none'"
		}
	});
};
