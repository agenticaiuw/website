import { redirect } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { canAssign, teamsFor } from '$lib/perm';
import { activeMembers, roster, teams, teamsByMember } from '$lib/server/db';
import type { MeetingKind } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { env, viewer: v } }) => {
	if (!canAssign(v)) redirect(303, '/meetings?error=forbidden');
	const kind: MeetingKind = url.searchParams.get('kind') === 'event' ? 'event' : 'meeting';
	const [allTeams, people, teamsOf] = await Promise.all([teams(env.DB), activeMembers(env.DB), teamsByMember(env.DB)]);
	const teamList = teamsFor(v, allTeams);
	const firstTeam = teamList[0]?.id;
	const picked = new Set(people.filter((p) => kind === 'event' || (firstTeam !== undefined && teamsOf.get(p.id)?.includes(firstTeam))).map((p) => p.id));
	return {
		title: kind === 'event' ? 'New club event' : 'New meeting',
		active: 'meetings' as const,
		kind,
		today: todayIn(env.TIMEZONE),
		teamList: teamList.map(({ id, name }) => ({ id, name })),
		people: roster(people),
		picked,
		teamsOf
	};
};
