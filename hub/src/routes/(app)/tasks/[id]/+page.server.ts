import { error, redirect } from '@sveltejs/kit';
import { formatDue, isDate, isTime, todayIn } from '$lib/dates';
import { all, logTask, nowIso, TASK_SELECT, taskById } from '$lib/server/db';
import { id, list, readForm, str } from '$lib/server/form';
import { loadMeeting } from '$lib/server/meeting-access';
import { canManageTask, isExec } from '$lib/perm';
import { notifyAssigned, notifyDueChanged, notifyTaskEnded } from '$lib/server/reminders';
import { createTasks, readRepeat } from '$lib/server/tasks';
import type { TaskRow } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

type Activity = { id: number; kind: string; body: string; created_at: string; member_name: string | null };

export const load: PageServerLoad = async ({ params, url, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task) error(404, 'Not found');
	const [activity, copies, meeting] = await Promise.all([
		all<Activity>(
			env.DB,
			`SELECT a.id, a.kind, a.body, a.created_at, m.name AS member_name
			 FROM task_activity a LEFT JOIN members m ON m.id = a.member_id
			 WHERE a.task_id = ? ORDER BY a.created_at, a.id`,
			task.id
		),
		task.group_id ? all<TaskRow>(env.DB, `${TASK_SELECT} WHERE t.group_id = ? ORDER BY a.name COLLATE NOCASE`, task.group_id) : Promise.resolve([]),
		task.meeting_id ? loadMeeting(env, v, String(task.meeting_id)) : null
	]);
	return {
		title: task.title,
		active: 'tasks' as const,
		today: todayIn(env.TIMEZONE),
		timeZone: env.TIMEZONE,
		task,
		activity,
		copies,
		meeting: meeting && { id: meeting.id, title: meeting.title },
		// A shared task: with ?all=1 the page is an overview for someone who isn't on it.
		overview: copies.length > 1 && url.searchParams.get('all') === '1'
	};
};

export const actions: Actions = {
	/** Saves a task for everyone on it: same title, details, due date, team and urgency; adds and removes people. */
	default: async ({ params, request, locals: { env, viewer: v } }) => {
		const taskId = id(params.id);
		const task = taskId ? await taskById(env.DB, taskId) : null;
		if (!task || !canManageTask(v, task)) error(404, 'Not found');
		const form = await readForm(request);
		const title = str(form.title, 200);
		const details = str(form.details, 10_000);
		const due = str(form.due_date);
		const dueTime = isTime(str(form.due_time)) ? str(form.due_time) : '';
		const teamId = id(form.team);
		const urgent = str(form.urgent) === '1' ? 1 : 0;
		// Once the next one's made, this one's repeat is history and stays as it was.
		const { repeatDays, repeatUntil } = task.repeated ? { repeatDays: task.repeat_days, repeatUntil: task.repeat_until } : readRepeat(form, due);
		const wanted = [...new Set(list(form.assignee).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
		const edit = `/tasks/${task.id}/edit`;
		if (!title || !wanted.length) redirect(303, `${edit}?error=missing`);
		if (!isDate(due)) redirect(303, `${edit}?error=date`);
		if (!isExec(v) && teamId !== task.team_id && !(teamId && v.leadOf.has(teamId))) redirect(303, `${edit}?error=forbidden`);

		const db = env.DB;
		const copies = task.group_id ? await all<TaskRow>(db, `${TASK_SELECT} WHERE t.group_id = ? ORDER BY t.id`, task.group_id) : [{ ...task }];
		const staying = copies.filter((o) => wanted.includes(o.assignee_id));
		const leaving = copies.filter((o) => !wanted.includes(o.assignee_id));
		const adding = wanted.filter((a) => !copies.some((o) => o.assignee_id === a));

		// New people get their own copy, filed under the task's team.
		let newIds: number[] = [];
		if (adding.length) {
			const made = await createTasks(env, v, { title, details, assignees: adding, due, dueTime, teamId, meetingId: task.meeting_id, urgent: !!urgent, repeatDays, repeatUntil });
			if ('error' in made) redirect(303, `${edit}?error=${made.error}`);
			newIds = made.ids;
		}
		const groupId = task.group_id ?? staying[0]?.id ?? newIds[0];
		const stmts: D1PreparedStatement[] = [];
		if (copies.length + newIds.length - leaving.length > 1) {
			stmts.push(db.prepare('UPDATE tasks SET group_id = ? WHERE id IN (SELECT value FROM json_each(?))').bind(groupId, JSON.stringify([...staying.map((o) => o.id), ...newIds])));
		}
		const moved: number[] = [];
		const oldDue = new Map<number, { date: string; time: string }>();
		for (const o of staying) {
			const dueChanged = due !== o.due_date || dueTime !== o.due_time;
			if (dueChanged) {
				moved.push(o.id);
				oldDue.set(o.id, { date: o.due_date, time: o.due_time });
			}
			stmts.push(
				db
					.prepare(
						`UPDATE tasks SET title = ?, details = ?, team_id = ?, due_date = ?, due_time = ?, urgent = ?, repeat_days = ?, repeat_until = ?, updated_at = ?,
						 urgent_until = CASE WHEN ? THEN NULL ELSE urgent_until END,
						 escalated_on = CASE WHEN ? THEN NULL ELSE escalated_on END,
						 last_reminder_on = CASE WHEN ? THEN NULL ELSE last_reminder_on END WHERE id = ?`
					)
					.bind(title, details, teamId, due, dueTime, urgent, repeatDays, repeatUntil, nowIso(), urgent && !o.urgent ? 1 : 0, dueChanged ? 1 : 0, dueChanged ? 1 : 0, o.id)
			);
			if (dueChanged) stmts.push(logTask(db, o.id, v.id, 'due_changed', `${formatDue(o.due_date, o.due_time)} → ${formatDue(due, dueTime)}`));
			if (title !== o.title || details !== o.details || teamId !== o.team_id || urgent !== o.urgent || repeatDays !== o.repeat_days || repeatUntil !== o.repeat_until) stmts.push(logTask(db, o.id, v.id, 'edited'));
			for (const gone of leaving) stmts.push(logTask(db, o.id, v.id, 'unassigned', `${gone.assignee_name} is no longer on this task.`));
		}
		for (const gone of leaving) stmts.push(db.prepare('DELETE FROM tasks WHERE id = ?').bind(gone.id));
		await db.batch(stmts);
		await notifyAssigned(env, v, newIds);
		await notifyDueChanged(env, v, moved, oldDue);
		await notifyTaskEnded(env, v, leaving, 'removed');
		// Stay on this copy unless its person was taken off.
		const landing = staying.some((o) => o.id === task.id) ? task.id : (staying[0]?.id ?? newIds[0]);
		const shared = staying.length + newIds.length > 1;
		redirect(303, `/tasks/${landing}?${shared && landing !== task.id ? 'all=1&' : ''}ok=saved`);
	}
};
