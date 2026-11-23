import { error } from '@sveltejs/kit';
import { fileByKey, fileResponse } from '$lib/server/files';
import type { RequestHandler } from './$types';

/** The club constitution, for any signed-in member to download. It's also on the Files page. */
export const GET: RequestHandler = async ({ locals: { env } }) => {
	const file = await fileByKey(env.DB, 'constitution');
	if (!file || file.removed_at) error(404, 'Not found');
	return fileResponse(env, file);
};
