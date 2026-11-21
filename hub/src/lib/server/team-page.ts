import { error, redirect } from '@sveltejs/kit';
import { boardTasks } from './board';
import { addDays, todayIn } from '../dates';
import { all, first, MEETING_SELECT, MEETING_VISIBLE, TASK_ON_TEAM, TASK_SELECT, TASK_VISIBLE, visible as canSee } from './db';
import { id, isHttpUrl } from './form';
import { teamLibrary, teamRoster, teamSubteams } from './teams';
import { isExec } from '../perm';
import type { Env, MeetingRow, TaskRow, Team, Viewer } from '../types';

/** Everything the team page (and a subteam's view of it) shows. `subteamParam` is set on /teams/:id/subteams/:subteam. */
export async function loadTeamPage(env: Env, v: Viewer, url: URL, teamParam: string, subteamParam?: string) {
	const db = env.DB;
	const team = await first<Team>(db, 'SELECT * FROM teams WHERE id = ?', id(teamParam));
	if (!team || (team.kind === 'exec' && !isExec(v))) error(404, 'Not found');
	const root = `/teams/${team.id}`;
	const today = todayIn(env.TIMEZONE);
	const [members, subteams] = await Promise.all([teamRoster(db, team.id), teamSubteams(db, team.id)]);
	const editable = isExec(v) || members.some((m) => m.id === v.id && m.can_manage_page);
	const visible = subteams.filter((s) => !s.archived || editable);
	const legacySubteam = url.searchParams.get('subteam');
	if (!subteamParam && legacySubteam && id(legacySubteam)) redirect(303, `${root}/subteams/${id(legacySubteam)}`);
	const subteamId = subteamParam ? id(subteamParam) : null;
	const selected = subteamId ? visible.find((s) => s.id === subteamId) : undefined;
	if (subteamParam && !selected) error(404, 'Not found');
	const selectedIds = selected ? [selected.id] : [];
	const back = selected ? `${root}/subteams/${selected.id}` : root;
	const meetingsOn = `m.id IN (SELECT meeting_id FROM meeting_teams WHERE team_id = ?2) AND ${canSee(v, MEETING_VISIBLE)}`;
	const [tasks, legacy, subRoster, library, upcoming, recent] = await Promise.all([
		boardTasks(db, v.id, { team: team.id, subteams: selectedIds }),
		// The hub's regular tasks for this team, as the viewer may see them; finished ones for 30 days.
		selectedIds.length
			? Promise.resolve([])
			: all<TaskRow>(db, `${TASK_SELECT} WHERE ${TASK_ON_TEAM(2)} AND ${canSee(v, TASK_VISIBLE)} AND (t.status = 'open' OR t.completed_at >= ?3) ORDER BY t.due_date, t.id LIMIT 300`, v.id, team.id, addDays(today, -30)),
		all<{ subteam_id: number; member_id: number }>(db, 'SELECT subteam_id, member_id FROM subteam_members WHERE team_id = ?', team.id),
		teamLibrary(db, v, team.id),
		selected ? Promise.resolve([]) : all<MeetingRow>(db, `${MEETING_SELECT} WHERE ${meetingsOn} AND m.date >= ?3 ORDER BY m.date, m.time LIMIT 10`, v.id, team.id, today),
		selected ? Promise.resolve([]) : all<MeetingRow>(db, `${MEETING_SELECT} WHERE ${meetingsOn} AND m.date < ?3 ORDER BY m.date DESC, m.time DESC LIMIT 5`, v.id, team.id, today)
	]);
	const canCreate = !team.archived && !selected?.archived && (isExec(v) || v.teamIds.has(team.id));
	const manager = isExec(v) || v.leadOf.has(team.id);
	const resources = (
		[
			['Discord', team.discord_url],
			['Drive', team.drive_url],
			['GitHub', team.github_url]
		] as [string, string | undefined][]
	).filter((pair): pair is [string, string] => !!pair[1] && isHttpUrl(pair[1]));
	const q = (key: string) => url.searchParams.get(key) ?? '';
	return {
		title: selected?.name ?? team.name,
		active: 'teams' as const,
		today,
		root,
		back,
		team: { id: team.id, name: team.name, kind: team.kind, archived: team.archived, description: team.description, discord_url: team.discord_url ?? '', drive_url: team.drive_url ?? '', github_url: team.github_url ?? '', cal_url: team.cal_url ?? '' },
		// Emails only go to people who pick team members (and need NetIDs to tell names apart).
		members: editable || manager ? members : members.map((m) => ({ ...m, email: '' })),
		subteams: visible,
		selected: selected ?? null,
		selectedIds,
		subRoster,
		editable,
		manager,
		canCreate,
		tasks,
		legacy,
		library,
		libraryFilters: { type: q('library_type'), person: q('library_person'), creator: q('library_creator'), meeting: q('library_meeting'), group: q('library_group') },
		upcoming,
		recent,
		resources,
		due: addDays(today, 7),
		assignedPeople: new Set(!selectedIds.length && v.teamIds.has(team.id) ? [v.id] : []),
		assignedSubteams: new Set(manager ? selectedIds : [])
	};
}

export type TeamPageData = Awaited<ReturnType<typeof loadTeamPage>>;
