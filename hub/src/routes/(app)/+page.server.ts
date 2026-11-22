import { boardTasks } from '$lib/server/board';
import { addDays, todayIn } from '$lib/dates';
import { all, first, groupStats, MEETING_EXPECTED, MEETING_SELECT, MEETING_VISIBLE, TASK_SELECT, visible } from '$lib/server/db';
import { canAssign, isExec } from '$lib/perm';
import type { MeetingRow, TaskRow } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { env, viewer: v } }) => {
	const db = env.DB;
	const today = todayIn(env.TIMEZONE);

	const [mine, assignedByMe, upcoming, clubOverdue, shared] = await Promise.all([
		all<TaskRow>(db, `${TASK_SELECT} WHERE t.assignee_id = ? AND t.status = 'open' ORDER BY t.due_date, t.id`, v.id),
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
		isExec(v) ? first<{ n: number; people: number }>(db, "SELECT COUNT(*) AS n, COUNT(DISTINCT assignee_id) AS people FROM tasks WHERE status = 'open' AND due_date < ?", today) : Promise.resolve(null),
		boardTasks(db, v.id, { assignee: v.id, status: 'open' })
	]);

	// Meetings this week the viewer is expected at and hasn't written an update for.
	const updateDue = await all<{ id: number }>(
		db,
		`SELECT m.id FROM meetings m JOIN members mb ON mb.id = ?1 WHERE m.kind = 'meeting' AND m.date BETWEEN ?2 AND ?3
		 AND ${MEETING_EXPECTED.replaceAll('?1', 'm.id')}
		 AND NOT EXISTS (SELECT 1 FROM meeting_updates u WHERE u.meeting_id = m.id AND u.member_id = ?1)`,
		v.id,
		today,
		addDays(today, 7)
	);

	return {
		title: 'My work',
		updateDue: updateDue.map((r) => r.id),
		active: 'home' as const,
		today,
		weekOut: addDays(today, 7),
		mine,
		assignedByMe,
		groups: await groupStats(db, assignedByMe),
		upcoming,
		clubOverdue,
		shared
	};
};
