import { redirect } from '@sveltejs/kit';
import { endSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (e) => {
	await endSession(e);
	redirect(303, '/login');
};
