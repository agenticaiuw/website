import { error } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { activeMembers, all, roster, taskById, teams, teamsByMember } from '$lib/server/db';
import { id } from '$lib/server/form';
import { canManageTask, teamsFor } from '$lib/perm';
import type { Team } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer: v } }) => {
	const taskId = id(params.id);
	const task = taskId ? await taskById(env.DB, taskId) : null;
	if (!task || !canManageTask(v, task)) error(404, 'Not found');
	const [people, teamList, teamsOf, copies] = await Promise.all([
		activeMembers(env.DB),
		teams(env.DB),
		teamsByMember(env.DB),
		task.group_id ? all<{ assignee_id: number }>(env.DB, 'SELECT assignee_id FROM tasks WHERE group_id = ?', task.group_id) : Promise.resolve([{ assignee_id: task.assignee_id }])
	]);
	const teamChoices = teamsFor(v, teamList);
	const current = task.team_id ? teamList.find((t) => t.id === task.team_id) : undefined;
	if (current && !teamChoices.some((t) => t.id === current.id)) teamChoices.push(current);
	const onTeam = (memberId: number, teamId: number) => teamsOf.get(memberId)?.includes(teamId) ?? false;
	const short = (t: Team) => ({ id: t.id, name: t.name });
	return {
		title: `Edit: ${task.title}`,
		active: 'tasks' as const,
		today: todayIn(env.TIMEZONE),
		task,
		people: roster(people),
		teamsOf,
		pickTeams: teamsFor(v, teamList).filter((t) => people.some((p) => onTeam(p.id, t.id))).map(short),
		teamChoices: teamChoices.map(short),
		picked: new Set(copies.map((x) => x.assignee_id))
	};
};
