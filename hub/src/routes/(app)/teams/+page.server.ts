import { redirect } from '@sveltejs/kit';
import { activeMembers, all, roster, run, TASK_ON_TEAM, teams } from '$lib/server/db';
import { readForm, str } from '$lib/server/form';
import { isExec } from '$lib/perm';
import type { TeamMemberRow } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const TEAM_LINKS =
	"SELECT x.team_id, x.member_id, x.is_lead, x.title, m.name, m.role FROM team_members x JOIN members m ON m.id = x.member_id WHERE m.active = 1 ORDER BY m.role = 'exec' DESC, x.is_lead DESC, x.title = '', m.name COLLATE NOCASE";

export const load: PageServerLoad = async ({ locals: { env, viewer: v } }) => {
	const editable = isExec(v);
	const [teamList, links, people, counts] = await Promise.all([
		teams(env.DB, true),
		all<TeamMemberRow>(env.DB, TEAM_LINKS),
		editable ? activeMembers(env.DB) : Promise.resolve([]),
		all<{ team_id: number; n: number }>(env.DB, `SELECT tt.id AS team_id, (SELECT COUNT(*) FROM tasks t WHERE t.status = 'open' AND ${TASK_ON_TEAM(1).replaceAll('?1', 'tt.id')}) AS n FROM teams tt`)
	]);
	// Everyone sees the project teams; exec-only teams are for execs.
	const listed = (editable ? teamList : teamList.filter((t) => t.kind !== 'exec')).map(({ id, name, kind, archived }) => ({ id, name, kind, archived }));
	const shown = new Set(listed.map((t) => t.id));
	return {
		title: 'Teams',
		active: 'teams' as const,
		editable,
		teams: listed,
		links: links.filter((l) => shown.has(l.team_id)),
		people: roster(people),
		open: new Map(counts.map((r) => [r.team_id, r.n]))
	};
};

export const actions: Actions = {
	default: async ({ request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/?error=forbidden');
		const form = await readForm(request);
		const name = str(form.name, 100);
		if (!name) redirect(303, '/teams?error=missing');
		await run(env.DB, 'INSERT INTO teams (name, kind) VALUES (?, ?) ON CONFLICT(name) DO NOTHING', name, str(form.kind) === 'exec' ? 'exec' : 'project');
		redirect(303, '/teams?ok=created');
	}
};
