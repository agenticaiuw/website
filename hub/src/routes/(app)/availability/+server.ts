import { redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { readForm, str } from '$lib/server/form';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { env, viewer } }) => {
	const raw = (await readForm(request)).hours;
	if (typeof raw !== 'string' || raw.length > 32) redirect(303, '/?error=hours');
	const value = str(raw);
	const hours = value === '' ? null : Number(value);
	if (hours !== null && (!/^\d+(\.\d+)?$/.test(value) || hours < 0 || hours > 168)) redirect(303, '/?error=hours');
	await run(env.DB, 'UPDATE members SET available_hours = ? WHERE id = ?', hours, viewer.id);
	redirect(303, '/?ok=saved');
};
