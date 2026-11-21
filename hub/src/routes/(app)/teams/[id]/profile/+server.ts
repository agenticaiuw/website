import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { id, isHttpUrl, readForm, str } from '$lib/server/form';
import { canManagePage } from '$lib/server/teams';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const team = id(params.id);
	if (!team || !(await canManagePage(env.DB, v, team))) error(404, 'Not found');
	const form = await readForm(request);
	const links = [str(form.discord, 2048), str(form.drive, 2048), str(form.github, 2048)];
	const cal = str(form.cal, 2048);
	const path = `/teams/${team}`;
	if (links.some((url) => url && (!isHttpUrl(url) || new URL(url).protocol !== 'https:'))) redirect(303, `${path}?error=link`);
	if (cal && (!isHttpUrl(cal) || new URL(cal).protocol !== 'https:' || !['cal.com', 'www.cal.com'].includes(new URL(cal).hostname.toLowerCase()))) redirect(303, `${path}?error=cal`);
	await run(env.DB, 'UPDATE teams SET description = ?, discord_url = ?, drive_url = ?, github_url = ?, cal_url = ? WHERE id = ?', str(form.description), ...links, cal, team);
	redirect(303, `${path}?ok=saved`);
};
