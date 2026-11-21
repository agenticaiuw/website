import { formatDue, isDate, isTime } from '../dates';
import { isExec } from '../perm';
import type { Env, Viewer } from '../types';
import { logTask, memberById, run } from './db';
import { str } from './form';

/**
 * Validates and inserts tasks, one per assignee. Shared with meeting action items.
 * Returns the new ids, or an error code for the redirect.
 */
export async function createTasks(
	env: Env,
	v: Viewer,
	input: { title: string; details: string; assignees: number[]; due: string; dueTime?: string; teamId: number | null; teamOf?: (assignee: number) => number | null; meetingId: number | null; urgent?: boolean; repeatDays?: number; repeatUntil?: string | null }
): Promise<{ ids: number[] } | { error: string }> {
	if (!input.title || !input.assignees.length) return { error: 'missing' };
	if (!isDate(input.due)) return { error: 'date' };
	const teamOf = input.teamOf ?? (() => input.teamId);
	const assignees = [...new Set(input.assignees)];
	// Others' tasks go under a team you lead; your own under no team or one you're on.
	if (!isExec(v)) {
		for (const a of assignees) {
			const team = teamOf(a);
			if (a !== v.id ? !(team && v.leadOf.has(team)) : team !== null && !v.teamIds.has(team)) return { error: 'forbidden' };
		}
	}
	const ids: number[] = [];
	for (const assignee of assignees) {
		const person = await memberById(env.DB, assignee);
		if (!person || !person.active) continue;
		const res = await run(
			env.DB,
			'INSERT INTO tasks (title, details, assignee_id, assigned_by, team_id, meeting_id, due_date, due_time, urgent, repeat_days, repeat_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			input.title,
			input.details,
			assignee,
			v.id,
			teamOf(assignee),
			input.meetingId,
			input.due,
			isTime(input.dueTime) ? input.dueTime : '',
			input.urgent ? 1 : 0,
			input.repeatDays ?? 0,
			input.repeatUntil ?? null
		);
		const taskId = Number(res.meta.last_row_id);
		ids.push(taskId);
		await logTask(env.DB, taskId, v.id, 'created', assignee === v.id ? '' : `Assigned to ${person.name}, due ${formatDue(input.due, input.dueTime)}`).run();
	}
	if (ids.length > 1) await run(env.DB, 'UPDATE tasks SET group_id = ? WHERE id IN (SELECT value FROM json_each(?))', ids[0], JSON.stringify(ids));
	return ids.length ? { ids } : { error: 'missing' };
}

/** The repeat fields from a form: days (0 = doesn't repeat) and an optional end date. */
export function readRepeat(form: Record<string, unknown>, due: string) {
	const days = Number(str(form.repeat));
	const repeatDays = days === 1 || days === 7 || days === 14 ? days : 0;
	const until = str(form.repeat_until);
	return { repeatDays, repeatUntil: repeatDays && isDate(until) && until >= due ? until : null };
}
