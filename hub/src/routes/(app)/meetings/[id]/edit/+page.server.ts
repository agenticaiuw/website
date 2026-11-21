import { error } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { meetingTeams } from '$lib/meeting-teams';
import { canEditMeeting, teamsFor } from '$lib/perm';
import { activeMembers, roster, teams, teamsByMember } from '$lib/server/db';
import { loadMeeting } from '$lib/server/meeting-access';
import { cadence, laterInSeries, pickedFor } from '$lib/server/meetings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer: v } }) => {
	const m = await loadMeeting(env, v, params.id);
	if (!m || !canEditMeeting(v, m)) error(404, 'Not found');
	const [allTeams, series, people, teamsOf] = await Promise.all([teams(env.DB), laterInSeries(env.DB, m), activeMembers(env.DB), teamsByMember(env.DB)]);
	const picked = await pickedFor(env.DB, m, teamsOf, people);
	// The meeting's own teams stay on the list, even ones this person couldn't pick for a new one.
	const teamList = [...teamsFor(v, allTeams)];
	for (const t of meetingTeams(m)) if (!teamList.some((x) => x.id === t.id)) teamList.push(allTeams.find((x) => x.id === t.id) ?? { ...t, description: '', archived: 0 });
	teamList.sort((a, b) => Number(a.kind === 'project') - Number(b.kind === 'project') || a.name.localeCompare(b.name));
	return {
		title: `Edit: ${m.title}`,
		active: 'meetings' as const,
		m,
		today: todayIn(env.TIMEZONE),
		teamList: teamList.map(({ id, name }) => ({ id, name })),
		people: roster(people),
		picked,
		teamsOf,
		later: series.length,
		every: cadence(m.date, series),
		last: series.at(-1)?.date
	};
};
