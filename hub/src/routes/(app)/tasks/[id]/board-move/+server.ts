import { error, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { BOARD_STATUSES } from '$lib/board';
import { setTaskStatus, taskById } from '$lib/server/db';
import { id, readForm, str, withNotice } from '$lib/server/form';
import { canCompleteTask } from '$lib/perm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task || !canCompleteTask(v, task)) error(404, 'Not found');
	const form = await readForm(request);
	const next = BOARD_STATUSES.find(([status]) => status === str(form.status));
	const back = safeRedirect(str(form.back) || `/tasks/${task.id}`);
	if (!next) redirect(303, withNotice(back, 'error', 'missing'));
	const status = next[0] === 'in_progress' ? 'open' : next[0];
	const inProgress = next[0] === 'in_progress';
	if (status !== task.status || inProgress !== !!task.board_in_progress) {
		await setTaskStatus(env.DB, task.id, status, v.id, '', inProgress);
	}
	redirect(303, withNotice(back, 'ok', 'saved'));
};
