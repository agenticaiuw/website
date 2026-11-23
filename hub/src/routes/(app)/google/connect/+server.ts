import { redirect } from '@sveltejs/kit';
import { authUrl, configured } from '$lib/server/google-group';
import { execOnly } from '$lib/server/perm';
import type { RequestHandler } from './$types';

/** Starts the one-time Google sign-in that lets the hub add website signups to the Google Group. */
export const GET: RequestHandler = ({ cookies, locals: { env, viewer } }) => {
	execOnly(viewer);
	if (!configured(env)) redirect(303, '/email#google');
	const state = crypto.randomUUID();
	cookies.set('google_state', state, { path: '/google', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
	redirect(303, authUrl(env, state));
};
