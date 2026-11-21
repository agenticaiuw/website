import { addDays, todayIn } from '$lib/dates';
import { activeMembers, roster, teams, teamsByMember } from '$lib/server/db';
import { id } from '$lib/server/form';
import { isExec, teamsFor } from '$lib/perm';
import type { Team, Viewer } from '$lib/types';
import type { PageServerLoad } from './$types';

function assignableTeams(v: Viewer, all: Team[]) {
	// Anyone can file a task for themselves under a team they're on.
	return isExec(v) ? all : all.filter((t) => v.leadOf.has(t.id) || (t.kind === 'project' && v.teamIds.has(t.id)));
}

export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	const today = todayIn(env.TIMEZONE);
	const [people, teamList, teamsOf] = await Promise.all([activeMembers(env.DB), teams(env.DB), teamsByMember(env.DB)]);
	const onTeam = (memberId: number, teamId: number) => teamsOf.get(memberId)?.includes(teamId) ?? false;
	const preTeam = id(url.searchParams.get('team'));
	const preAssignee = id(url.searchParams.get('assignee'));
	const short = (t: Team) => ({ id: t.id, name: t.name });
	return {
		title: 'New task',
		active: 'tasks' as const,
		due: addDays(today, 7),
		minDue: addDays(today, -365),
		people: roster(people),
		teamsOf,
		pickTeams: teamsFor(v, teamList).filter((t) => people.some((p) => onTeam(p.id, t.id))).map(short),
		ownTeams: assignableTeams(v, teamList).map(short),
		preTeam,
		picked: new Set(preTeam ? people.filter((p) => onTeam(p.id, preTeam)).map((p) => p.id) : [preAssignee ?? v.id])
	};
};
