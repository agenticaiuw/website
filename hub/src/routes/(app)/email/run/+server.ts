import { redirect } from '@sveltejs/kit';
import { execOnly } from '$lib/server/email-admin';
import { runDailyReminders } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals: { env, viewer } }) => {
	execOnly(viewer);
	await runDailyReminders(env);
	redirect(303, '/email?ok=reminders');
};
