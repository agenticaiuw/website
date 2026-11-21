import { boardTasks } from '$lib/server/board';
import { addDays, todayIn } from '$lib/dates';
import { all, first, groupStats, MEETING_SELECT, MEETING_VISIBLE, TASK_SELECT, visible } from '$lib/server/db';
import { canAssign, isExec } from '$lib/perm';
import type { MeetingRow, TaskRow, Team, TeamMemberRow } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { env, viewer: v } }) => {
	const db = env.DB;
	const today = todayIn(env.TIMEZONE);

	const [mine, recentDone, assignedByMe, upcoming, recent, clubOverdue, shared, myTeams, teamMembers] = await Promise.all([
		all<TaskRow>(db, `${TASK_SELECT} WHERE t.assignee_id = ? AND t.status = 'open' ORDER BY t.due_date, t.id`, v.id),
		all<TaskRow>(db, `${TASK_SELECT} WHERE t.assignee_id = ? AND t.status = 'done' ORDER BY t.completed_at DESC LIMIT 5`, v.id),
		canAssign(v)
			? all<TaskRow>(db, `${TASK_SELECT} WHERE t.assigned_by = ? AND t.assignee_id != ? AND t.status = 'open' ORDER BY t.due_date, t.id LIMIT 300`, v.id, v.id)
			: Promise.resolve([]),
		// A repeating meeting shows once, at its next date.
		all<MeetingRow>(
			db,
			`${MEETING_SELECT} WHERE ${visible(v, MEETING_VISIBLE)} AND m.date >= ?2
			 AND (m.series_id IS NULL OR m.date = (SELECT MIN(x.date) FROM meetings x WHERE x.series_id = m.series_id AND x.date >= ?2))
			 ORDER BY m.date, m.time LIMIT 5`,
			v.id,
			today
		),
		all<MeetingRow>(db, `${MEETING_SELECT} WHERE ${visible(v, MEETING_VISIBLE)} AND m.date < ?2 ORDER BY m.date DESC, m.time DESC LIMIT 5`, v.id, today),
		isExec(v) ? first<{ n: number; people: number }>(db, "SELECT COUNT(*) AS n, COUNT(DISTINCT assignee_id) AS people FROM tasks WHERE status = 'open' AND due_date < ?", today) : Promise.resolve(null),
		boardTasks(db, v.id, { assignee: v.id, status: 'open' }),
		all<Team>(db, "SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE tm.member_id = ? AND t.archived = 0 ORDER BY t.kind = 'exec' DESC, t.name COLLATE NOCASE", v.id),
		all<TeamMemberRow>(
			db,
			`SELECT x.team_id, x.member_id, x.is_lead, x.title, m.name, m.role FROM team_members x JOIN members m ON m.id = x.member_id
		 WHERE m.active = 1 AND x.team_id IN (SELECT team_id FROM team_members WHERE member_id = ?) ORDER BY m.role = 'exec' DESC, x.is_lead DESC, x.title = '', m.name COLLATE NOCASE`,
			v.id
		)
	]);

	return {
		title: 'My work',
		active: 'home' as const,
		today,
		weekOut: addDays(today, 7),
		mine,
		recentDone,
		assignedByMe,
		groups: await groupStats(db, assignedByMe),
		upcoming,
		recent,
		clubOverdue,
		shared,
		myTeams,
		teamMembers
	};
};
