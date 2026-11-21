import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { editableMeeting } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	const m = await editableMeeting(env, viewer, params.id);
	if (!m) error(404, 'Not found');
	await run(env.DB, 'DELETE FROM forms WHERE meeting_id = ?', m.id);
	redirect(303, `/meetings/${m.id}?ok=deleted`);
};
