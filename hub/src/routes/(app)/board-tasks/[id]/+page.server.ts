import { error } from '@sveltejs/kit';
import { boardTask } from '$lib/server/board';
import { canAssignOnBoard, seen } from '$lib/server/board-tasks';
import { todayIn } from '$lib/dates';
import { all, roster } from '$lib/server/db';
import { teamRoster, teamSubteams } from '$lib/server/teams';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const task = await boardTask(db, v.id, params.id);
	if (!seen(v, task)) error(404, 'Not found');
	const manager = canAssignOnBoard(v, task.team_id);
	const [activity, members, subteams, people, groups] = await Promise.all([
		all<{ name: string; kind: string; body: string; created_at: string }>(
			db,
			`SELECT m.name, a.kind, a.body, a.created_at
		 FROM board_task_activity a JOIN members m ON m.id = a.member_id WHERE a.task_id = ? ORDER BY a.id`,
			task.id
		),
		manager ? teamRoster(db, task.team_id) : undefined,
		manager ? teamSubteams(db, task.team_id) : undefined,
		manager ? all<{ member_id: number }>(db, 'SELECT member_id FROM board_task_people WHERE task_id = ?', task.id) : [],
		manager ? all<{ subteam_id: number }>(db, 'SELECT subteam_id FROM board_task_subteams WHERE task_id = ?', task.id) : []
	]);
	return {
		title: task.title,
		active: 'tasks' as const,
		today: todayIn(env.TIMEZONE),
		timeZone: env.TIMEZONE,
		task,
		manager,
		activity,
		members: members && roster(members),
		subteams: subteams?.filter((s) => !s.archived).map(({ id, name }) => ({ id, name })),
		assignedPeople: new Set(people.map((p) => p.member_id)),
		assignedSubteams: new Set(groups.map((g) => g.subteam_id))
	};
};
