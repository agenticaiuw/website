import { redirect } from '@sveltejs/kit';
import { execOnly } from '$lib/server/email-admin';
import { sendExecDigest } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { env, viewer } }) => {
	execOnly(viewer);
	await sendExecDigest(env);
	redirect(303, '/email?ok=digest');
};
