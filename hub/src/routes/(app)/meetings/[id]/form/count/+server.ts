import { json } from '@sveltejs/kit';
import { editableMeeting, formForMeeting } from '$lib/server/meetings';
import type { RequestHandler } from './$types';

/** How many have filled it out, for the screen's live count. */
export const GET: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	const m = await editableMeeting(env, viewer, params.id);
	const f = m && (await formForMeeting(env.DB, m.id));
	if (!f) return json({ error: 'not found' }, { status: 404 });
	return json({ count: f.responses });
};
