import { error, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { boardTaskHref } from '$lib/board';
import { boardLog, boardTask } from '$lib/server/board';
import { seen } from '$lib/server/board-tasks';
import { readForm, str, withNotice } from '$lib/server/form';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const task = await boardTask(db, v.id, params.id);
	if (!seen(v, task) || !v.teamIds.has(task.team_id)) error(404, 'Not found');
	const form = await readForm(request);
	const back = safeRedirect(str(form.back) || boardTaskHref(task.id));
	const [result] = await db.batch([
		db
			.prepare(
				`INSERT INTO board_task_people (task_id, team_id, member_id)
		 SELECT b.id, b.team_id, ?2 FROM board_tasks b WHERE b.id = ?1 AND b.status IN ('open', 'in_progress')
		  AND EXISTS (SELECT 1 FROM team_members WHERE team_id = b.team_id AND member_id = ?2)
		  AND NOT EXISTS (SELECT 1 FROM board_task_people x JOIN members m ON m.id = x.member_id WHERE x.task_id = b.id AND m.active = 1)
		  AND NOT EXISTS (SELECT 1 FROM board_task_subteams x JOIN subteams s ON s.id = x.subteam_id WHERE x.task_id = b.id AND s.archived = 0)
		 ON CONFLICT(task_id, member_id) DO NOTHING`
			)
			.bind(task.id, v.id),
		boardLog(db, task.id, v.id, 'claimed', '', true),
		db.prepare('UPDATE board_tasks SET version = version + 1 WHERE id = ? AND changes() > 0').bind(task.id)
	]);
	redirect(303, withNotice(back, result.meta.changes ? 'ok' : 'error', result.meta.changes ? 'assigned-self' : 'stale'));
};
