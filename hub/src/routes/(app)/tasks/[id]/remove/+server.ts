import { error, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { all, logTask, taskById } from '$lib/server/db';
import { id, readForm, str, withNotice } from '$lib/server/form';
import { canManageTask } from '$lib/perm';
import { notifyTaskEnded } from '$lib/server/reminders';
import type { RequestHandler } from './$types';

/** Takes one person off a shared task: their copy and its history go, the others stay. */
export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task) error(404, 'Not found');
	if (!canManageTask(v, task)) redirect(303, `/tasks/${task.id}?error=forbidden`);
	const db = env.DB;
	const others = task.group_id ? await all<{ id: number }>(db, 'SELECT id FROM tasks WHERE group_id = ? AND id != ? ORDER BY id', task.group_id, task.id) : [];
	// Someone has to be on a task: with just one person, reassign or drop it instead.
	if (!others.length) redirect(303, `/tasks/${task.id}?error=last`);
	await db.batch([db.prepare('DELETE FROM tasks WHERE id = ?').bind(task.id), ...others.map((o) => logTask(db, o.id, v.id, 'unassigned', `${task.assignee_name} is no longer on this task.`))]);
	await notifyTaskEnded(env, v, [task], 'removed');
	// Back where they were, unless that was the page of the copy that's now gone.
	const back = safeRedirect(str((await readForm(request)).back) || '/');
	const gone = new RegExp(`^/tasks/${task.id}(?![0-9])`).test(back) || back === '/';
	redirect(303, withNotice(gone ? `/tasks/${others[0].id}?all=1` : back, 'ok', 'removed'));
};
