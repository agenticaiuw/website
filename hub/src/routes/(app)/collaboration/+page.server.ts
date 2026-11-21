import { error } from '@sveltejs/kit';
import { canUseCollaboration, collaborationRequest } from '$lib/server/collaboration';
import type { PageServerLoad } from './$types';

type State = {
	sessions: { id: string; title: string; status: string }[];
	tasks: { id: number; session_id: string; author: string; instruction: string; status: string; run_status: string | null }[];
	runs: { id: string; session_id: string; status: string; supervisor: string }[];
	queue_controls: [string, boolean][];
	workspace_halted: boolean;
};

export const load: PageServerLoad = async ({ locals: { env, viewer } }) => {
	if (!canUseCollaboration(viewer)) error(403, 'Exec access required.');
	const base = { title: 'Collaboration', active: 'collaboration' as const };
	try {
		const res = await collaborationRequest(env, viewer.id);
		if (!res.ok) throw new Error('Unavailable');
		const state = await res.json<State>();
		return { ...base, state, sourceId: `hub:${crypto.randomUUID()}` };
	} catch {
		return { ...base, state: null, sourceId: '' };
	}
};
