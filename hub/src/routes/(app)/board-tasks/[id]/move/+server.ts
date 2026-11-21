import { error, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { BOARD_STATUSES, boardTaskHref } from '$lib/board';
import { boardLog, boardTask } from '$lib/server/board';
import { seen } from '$lib/server/board-tasks';
import { id, readForm, str, withNotice } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const task = await boardTask(db, v.id, params.id);
	if (!seen(v, task) || (!isExec(v) && !task.is_mine)) error(404, 'Not found');
	const form = await readForm(request);
	const next = BOARD_STATUSES.find(([key]) => key === str(form.status));
	const back = safeRedirect(str(form.back) || boardTaskHref(task.id));
	if (!next) redirect(303, withNotice(back, 'error', 'missing'));
	if (next[0] === task.status && id(form.version) === task.version) redirect(303, back);
	const [result] = await db.batch([
		db
			.prepare(
				`UPDATE board_tasks SET status = ?1, version = version + 1 WHERE id = ?2 AND version = ?3
		 AND (?4 = 1 OR EXISTS (SELECT 1 FROM board_task_recipients WHERE task_id = ?2 AND member_id = ?5))`
			)
			.bind(next[0], task.id, id(form.version), isExec(v) ? 1 : 0, v.id),
		boardLog(db, task.id, v.id, 'moved', next[1], true)
	]);
	redirect(303, withNotice(back, result.meta.changes ? 'ok' : 'error', result.meta.changes ? 'saved' : 'stale'));
};
