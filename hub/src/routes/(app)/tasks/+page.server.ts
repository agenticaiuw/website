import { redirect } from '@sveltejs/kit';
import { boardTasks } from '$lib/server/board';
import { isDate, isTime, todayIn } from '$lib/dates';
import { activeMembers, all, first, groupStats, roster, TASK_ON_TEAM, TASK_SELECT, teams, teamsByMember } from '$lib/server/db';
import { id, list, readForm, str } from '$lib/server/form';
import { canAssign, canSeeTask, isExec } from '$lib/perm';
import { notifyAssigned } from '$lib/server/reminders';
import { createTasks, readRepeat } from '$lib/server/tasks';
import type { TaskRow } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	const today = todayIn(env.TIMEZONE);
	const status = url.searchParams.get('status') ?? 'open';
	const assignee = id(url.searchParams.get('assignee'));
	const team = id(url.searchParams.get('team'));
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);

	const where = ['1 = 1'];
	const params: (string | number)[] = [];
	const bind = (value: string | number) => `?${params.push(value)}`;
	if (status === 'open') where.push("t.status = 'open'");
	else if (status === 'overdue') where.push(`t.status = 'open' AND t.due_date < ${bind(today)}`);
	else if (status === 'done') where.push("t.status = 'done'");
	else if (status === 'dropped') where.push("t.status = 'dropped'");
	if (assignee) where.push(`t.assignee_id = ${bind(assignee)}`);
	if (team) where.push(TASK_ON_TEAM(params.push(team)));
	if (q) where.push(`(t.title LIKE ${bind(`%${q}%`)} OR t.details LIKE ?${params.length})`);
	const order = status === 'done' || status === 'dropped' ? 't.completed_at DESC, t.updated_at DESC' : 't.due_date, t.id';

	const [tasks, people, teamList, sharedTasks] = await Promise.all([
		all<TaskRow>(env.DB, `${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 300`, ...params),
		activeMembers(env.DB),
		teams(env.DB),
		boardTasks(env.DB, v.id, { team, assignee, status, q, today })
	]);
	return {
		title: 'Tasks',
		active: 'tasks' as const,
		today,
		status,
		assignee,
		team,
		q,
		tasks: tasks.map((task) => (canSeeTask(v, task) ? task : { ...task, meeting_title: null })),
		groups: await groupStats(env.DB, tasks),
		people: roster(people),
		teamList: teamList.map(({ id, name }) => ({ id, name })),
		sharedTasks
	};
};

export const actions: Actions = {
	// New tasks: one per line, for everyone picked.
	default: async ({ request, locals: { env, viewer: v } }) => {
		const form = await readForm(request);
		const assignees = list(form.assignee).map(Number).filter((n) => Number.isInteger(n) && n > 0);
		// The teams ticked, in form order. Each person's task goes under the first one they're on.
		const picked = [...new Set(list(form.team).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
		// A lead who ticked people one by one files them under a team they lead.
		const led = isExec(v) ? [] : [...v.leadOf];
		const teamsOf = picked.length > 1 || (!picked.length && led.length) ? await teamsByMember(env.DB) : new Map<number, number[]>();
		const on = (a: number) => (t: number) => teamsOf.get(a)?.includes(t) ?? false;
		// One task per line that has a title, each with its own due date and optional time.
		const dues = list(form.due_date);
		const times = list(form.due_time);
		const rows = list(form.title)
			.map((title, i) => ({ title: title.slice(0, 200), due: dues[i] ?? '', time: isTime(times[i]) ? times[i] : '' }))
			.filter((r) => r.title);
		if (!rows.length) redirect(303, '/tasks/new?error=missing');
		if (rows.some((r) => !isDate(r.due))) redirect(303, '/tasks/new?error=date');
		const ids: number[] = [];
		for (const row of rows) {
			const result = await createTasks(env, v, {
				title: row.title,
				details: str(form.details, 10_000),
				assignees: canAssign(v) ? assignees : [v.id],
				due: row.due,
				dueTime: row.time,
				teamId: picked[0] ?? null,
				teamOf: (a) => picked.find(on(a)) ?? picked[0] ?? (a === v.id ? null : (led.find(on(a)) ?? led[0] ?? null)),
				meetingId: null,
				urgent: str(form.urgent) === '1',
				...readRepeat(form, row.due)
			});
			if ('error' in result) redirect(303, ids.length ? '/tasks?error=partial' : `/tasks/new?error=${result.error}`);
			ids.push(...result.ids);
		}
		// Each person gets one email listing all of their new tasks.
		await notifyAssigned(env, v, ids);
		if (rows.length > 1) {
			const people = [...new Set(canAssign(v) ? assignees : [v.id])];
			redirect(303, people.length === 1 ? `/tasks?assignee=${people[0]}&ok=tasks-created` : '/tasks?ok=tasks-created');
		}
		if (ids.length === 1) redirect(303, `/tasks/${ids[0]}?ok=created`);
		// Several people: your own copy if you're one of them, otherwise the overview of everyone.
		const own = await first<{ id: number }>(env.DB, 'SELECT id FROM tasks WHERE id IN (SELECT value FROM json_each(?)) AND assignee_id = ?', JSON.stringify(ids), v.id);
		redirect(303, own ? `/tasks/${own.id}?ok=assigned` : `/tasks/${ids[0]}?all=1&ok=assigned`);
	}
};
