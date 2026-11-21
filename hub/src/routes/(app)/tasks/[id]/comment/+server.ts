import { error, redirect } from '@sveltejs/kit';
import { logTask, taskById } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { canSeeTask } from '$lib/perm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task || !canSeeTask(v, task)) error(404, 'Not found');
	const body = str((await readForm(request)).body, 5000);
	if (body) await logTask(env.DB, task.id, v.id, 'comment', body).run();
	redirect(303, `/tasks/${task.id}?ok=commented`);
};
