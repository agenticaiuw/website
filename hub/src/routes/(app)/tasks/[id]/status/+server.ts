import { error, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { all, setTaskStatus, TASK_SELECT, taskById } from '$lib/server/db';
import { id, readForm, str, withNotice } from '$lib/server/form';
import { canCompleteTask, canManageTask } from '$lib/perm';
import { notifyTaskEnded } from '$lib/server/reminders';
import type { TaskRow, TaskStatus } from '$lib/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task) error(404, 'Not found');
	const form = await readForm(request);
	const status = str(form.status) as TaskStatus;
	// Only the assignee (or an exec) marks it done; whoever manages it can also drop it.
	const allowed = ['dropped', 'done', 'open'].includes(status) && (canCompleteTask(v, task) || (status === 'dropped' && canManageTask(v, task)));
	const back = safeRedirect(str(form.back) || `/tasks/${task.id}`);
	if (!allowed) redirect(303, withNotice(back, 'error', 'forbidden'));
	if (status === 'dropped' && str(form.all) === '1' && task.group_id && canManageTask(v, task)) {
		const open = await all<TaskRow>(env.DB, `${TASK_SELECT} WHERE t.group_id = ? AND t.status = 'open'`, task.group_id);
		for (const t of open) await setTaskStatus(env.DB, t.id, 'dropped', v.id);
		await notifyTaskEnded(env, v, open, 'dropped');
	} else if (task.status !== status) {
		await setTaskStatus(env.DB, task.id, status, v.id);
		if (status === 'dropped') await notifyTaskEnded(env, v, [task], 'dropped');
	}
	redirect(303, withNotice(back, 'ok', { done: 'done', open: 'reopened', dropped: 'dropped' }[status]));
};
