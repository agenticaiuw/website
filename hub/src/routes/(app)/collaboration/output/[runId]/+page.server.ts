import { error } from '@sveltejs/kit';
import { canUseCollaboration, collaborationRequest } from '$lib/server/collaboration';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer } }) => {
	if (!canUseCollaboration(viewer)) error(403, 'Exec access required.');
	const runId = params.runId;
	if (!/^[a-f0-9]{32}$/i.test(runId)) error(400, 'Invalid run.');
	let res: Response;
	try {
		res = await collaborationRequest(env, viewer.id, undefined, fetch, runId);
	} catch {
		error(502, 'Output unavailable.');
	}
	if (!res.ok) error(404, 'Output unavailable.');
	const result = await res.json<{ output: string }>().catch(() => error(502, 'Output unavailable.'));
	return { title: 'Run output', active: 'collaboration' as const, runId, output: result.output };
};
