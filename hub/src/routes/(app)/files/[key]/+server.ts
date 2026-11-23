import { error } from '@sveltejs/kit';
import { canSeeFile, dispositionName, fileByKey, fileBytes } from '$lib/server/files';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

/** Downloads a file from the Files page. Execs can also download removed ones before putting them back. */
export const GET: RequestHandler = async ({ params, locals: { env, viewer: v } }) => {
	const file = await fileByKey(env.DB, params.key);
	if (!file || !canSeeFile(v, file) || (file.removed_at && !isExec(v))) error(404, 'Not found');
	const bytes = await fileBytes(env.DB, file.key, file.size);
	if (!bytes) return new Response('File unavailable.', { status: 500 });
	return new Response(bytes.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': file.media_type,
			'Content-Disposition': `attachment; filename*=UTF-8''${dispositionName(file.name)}`,
			'Content-Security-Policy': "sandbox; default-src 'none'"
		}
	});
};
