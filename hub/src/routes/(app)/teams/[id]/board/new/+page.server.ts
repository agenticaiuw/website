import { error } from '@sveltejs/kit';
import { addDays, todayIn } from '$lib/dates';
import { canAssignOnBoard } from '$lib/server/board-tasks';
import { first, roster } from '$lib/server/db';
import { id } from '$lib/server/form';
import { teamRoster, teamSubteams } from '$lib/server/teams';
import { isExec } from '$lib/perm';
import type { Team } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const team = await first<Team>(db, 'SELECT * FROM teams WHERE id = ? AND archived = 0', id(params.id));
	if (!team || (!isExec(v) && !v.teamIds.has(team.id))) error(404, 'Not found');
	const manager = canAssignOnBoard(v, team.id);
	const [members, subteams] = manager ? await Promise.all([teamRoster(db, team.id), teamSubteams(db, team.id)]) : [undefined, undefined];
	const subteam = id(url.searchParams.get('subteam'));
	return {
		title: 'New team task',
		active: 'teams' as const,
		team: { id: team.id, name: team.name },
		due: addDays(todayIn(env.TIMEZONE), 7),
		members: members && roster(members),
		subteams: subteams?.filter((s) => !s.archived).map(({ id, name }) => ({ id, name })),
		assignedPeople: new Set(!subteam && v.teamIds.has(team.id) ? [v.id] : []),
		assignedSubteams: new Set(subteam ? [subteam] : [])
	};
};
