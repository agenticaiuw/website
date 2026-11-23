import { redirect } from '@sveltejs/kit';
import { setMeta } from '$lib/server/db';
import { connect, syncGroupQuietly } from '$lib/server/google-group';
import { execOnly } from '$lib/server/perm';
import type { RequestHandler } from './$types';

/** Where Google sends the exec back after the sign-in. Keeps it, then adds anyone waiting. */
export const GET: RequestHandler = async ({ url, cookies, platform, locals: { env, viewer } }) => {
	execOnly(viewer);
	const state = cookies.get('google_state');
	cookies.delete('google_state', { path: '/google' });
	const code = url.searchParams.get('code');
	let problem = '';
	if (url.searchParams.get('error')) problem = `Google sign-in didn’t finish (${url.searchParams.get('error')}).`;
	else if (!code || !state || url.searchParams.get('state') !== state) problem = 'That sign-in link expired. Press Connect again.';
	else {
		try {
			await connect(env, code);
			platform?.ctx.waitUntil(syncGroupQuietly(env));
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		}
	}
	if (problem) await setMeta(env.DB, 'google_group_error', problem.slice(0, 500));
	redirect(303, '/email#google');
};
