import { error, redirect } from '@sveltejs/kit';
import { boardTaskHref } from '$lib/board';
import { boardTask } from '$lib/server/board';
import { assignmentIds, canAssignOnBoard, fields, insertAssignments, seen } from '$lib/server/board-tasks';
import { isDate } from '$lib/dates';
import { all } from '$lib/server/db';
import { id, readForm } from '$lib/server/form';
import { notifyBoardAssigned } from '$lib/server/reminders';
import { teamRoster, teamSubteams } from '$lib/server/teams';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const task = await boardTask(db, v.id, params.id);
	if (!seen(v, task)) error(404, 'Not found');
	const manager = canAssignOnBoard(v, task.team_id);
	if (!manager && task.created_by !== v.id) error(404, 'Not found');
	const form = await readForm(request);
	const { title, details, due } = fields(form);
	const href = boardTaskHref(task.id);
	if (!title || !isDate(due)) redirect(303, `${href}?error=${title ? 'date' : 'missing'}`);
	const change = crypto.randomUUID();
	const version = id(form.version);
	const writes = [
		db.prepare('UPDATE board_tasks SET title = ?, details = ?, due_date = ?, version = version + 1, change_token = ? WHERE id = ? AND version = ?').bind(title, details, due, change, task.id, version)
	];
	if (manager) {
		const [members, subteams] = await Promise.all([teamRoster(db, task.team_id), teamSubteams(db, task.team_id)]);
		const people = assignmentIds(form, 'person', members.map((m) => m.id));
		const groups = assignmentIds(form, 'subteam', subteams.filter((s) => !s.archived).map((s) => s.id));
		if (!people || !groups) redirect(303, `${href}?error=selection`);
		if (!people.length && !groups.length) redirect(303, `${href}?error=assignment`);
		writes.push(
			db
				.prepare(
					`DELETE FROM board_task_people WHERE task_id = ?1 AND member_id IN (SELECT id FROM members WHERE active = 1)
			 AND EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?2)`
				)
				.bind(task.id, change),
			db
				.prepare(
					`DELETE FROM board_task_subteams WHERE task_id = ?1 AND subteam_id IN (SELECT id FROM subteams WHERE archived = 0)
			 AND EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?2)`
				)
				.bind(task.id, change),
			...insertAssignments(db, task.id, task.team_id, people, groups, change)
		);
	}
	writes.push(
		db
			.prepare(
				`INSERT INTO board_task_activity (task_id, member_id, kind, body)
	 SELECT id, ?, 'edited', '' FROM board_tasks WHERE id = ? AND change_token = ?`
			)
			.bind(v.id, task.id, change)
	);
	const before = new Set((await all<{ member_id: number }>(db, 'SELECT member_id FROM board_task_recipients WHERE task_id = ?', task.id)).map((r) => r.member_id));
	const [result] = await db.batch(writes);
	if (result.meta.changes && manager) await notifyBoardAssigned(env, v, { ...task, title, due_date: due }, before);
	redirect(303, `${href}?${result.meta.changes ? 'ok=saved' : 'error=stale'}`);
};
