import { error } from '@sveltejs/kit';
import { canSeeFile, fileByKey, fileResponse } from '$lib/server/files';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

/** Downloads a file from the Files page. Execs can also download removed ones before putting them back. */
export const GET: RequestHandler = async ({ params, locals: { env, viewer: v } }) => {
	const file = await fileByKey(env.DB, params.key);
	if (!file || !canSeeFile(v, file) || (file.removed_at && !isExec(v))) error(404, 'Not found');
	return fileResponse(env, file);
};
