import { error, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { BOARD_STATUSES, boardTaskHref } from '$lib/board';
import { boardLog, boardTask } from '$lib/server/board';
import { assignmentIds, canAssignOnBoard, fields, insertAssignments } from '$lib/server/board-tasks';
import { isDate } from '$lib/dates';
import { first } from '$lib/server/db';
import { id, readForm, str } from '$lib/server/form';
import { notifyBoardAssigned } from '$lib/server/reminders';
import { teamRoster, teamSubteams } from '$lib/server/teams';
import { isExec } from '$lib/perm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const team = id(params.id);
	if (!team || (!isExec(v) && !v.teamIds.has(team)) || !(await first(db, 'SELECT 1 FROM teams WHERE id = ? AND archived = 0', team))) error(404, 'Not found');
	const form = await readForm(request);
	const path = `/teams/${team}/board/new`;
	const { title, details, due } = fields(form);
	const status = str(form.status) || 'open';
	if (!title || !isDate(due)) redirect(303, `${path}?error=${title ? 'date' : 'missing'}`);
	if (!BOARD_STATUSES.some(([value]) => value === status)) redirect(303, `${path}?error=selection`);
	const manager = canAssignOnBoard(v, team);
	const people = manager ? assignmentIds(form, 'person', (await teamRoster(db, team)).map((m) => m.id)) : [v.id];
	const subteams = manager ? assignmentIds(form, 'subteam', (await teamSubteams(db, team)).filter((s) => !s.archived).map((s) => s.id)) : [];
	if (!people || !subteams) redirect(303, `${path}?error=selection`);
	if (!people.length && !subteams.length) redirect(303, `${path}?error=assignment`);
	const task = crypto.randomUUID();
	await db.batch([
		db.prepare('INSERT INTO board_tasks (id, team_id, created_by, title, details, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(task, team, v.id, title, details, due, status),
		...insertAssignments(db, task, team, people, subteams, ''),
		boardLog(db, task, v.id, 'created')
	]);
	const made = await boardTask(db, v.id, task);
	if (made) await notifyBoardAssigned(env, v, made);
	const requestedReturn = safeRedirect(str(form.return_path));
	const boardReturn = new RegExp(`^/teams/${team}/subteams/[1-9]\\d*$`).test(requestedReturn) ? requestedReturn : `/teams/${team}`;
	redirect(303, str(form.return_to_board) === '1' ? `${boardReturn}?ok=created#board-task-${task}` : `${boardTaskHref(task)}?ok=created`);
};
