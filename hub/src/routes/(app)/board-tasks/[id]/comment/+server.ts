import { error, redirect } from '@sveltejs/kit';
import { boardTaskHref } from '$lib/board';
import { boardLog, boardTask } from '$lib/server/board';
import { seen } from '$lib/server/board-tasks';
import { readForm, str } from '$lib/server/form';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const task = await boardTask(env.DB, v.id, params.id);
	if (!seen(v, task)) error(404, 'Not found');
	const text = str((await readForm(request)).body);
	if (text) await boardLog(env.DB, task.id, v.id, 'comment', text).run();
	redirect(303, `${boardTaskHref(task.id)}?${text ? 'ok=commented' : 'error=missing'}`);
};
