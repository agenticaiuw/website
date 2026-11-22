import { error, redirect } from '@sveltejs/kit';
import { taskById } from '$lib/server/db';
import { id, readForm, str, withNotice } from '$lib/server/form';
import { canManageTask } from '$lib/perm';
import { remindTask } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

/** Emails everyone on the task who hasn't finished it, with the sender's message. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task || !canManageTask(v, task)) error(404, 'Not found');
	const form = await readForm(request);
	const back = `/tasks/${task.id}${str(form.all) === '1' ? '?all=1' : ''}`;
	const message = str(form.message, 2000);
	if (!message) redirect(303, withNotice(back, 'error', 'missing'));
	const { sent } = await remindTask(env, { id: v.id, name: v.name }, task, message);
	redirect(303, withNotice(back, sent ? 'ok' : 'error', sent ? 'reminded' : 'unreminded'));
};
