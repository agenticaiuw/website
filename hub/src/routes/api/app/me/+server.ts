import { json } from '@sveltejs/kit';
import { AHEAD_DAYS, boardJson, meetingJson, memberJson, MY_MEETINGS, PAST_DAYS, signInAgain, taskJson } from '$lib/server/app-api';
import { bearerMember } from '$lib/server/auth';
import { boardTasks } from '$lib/server/board';
import { all, TASK_SELECT } from '$lib/server/db';
import { addDays, todayIn } from '$lib/dates';
import type { MeetingRow, TaskRow } from '$lib/types';

export async function GET(e) {
	const env = e.locals.env;
	const member = await bearerMember(e);
	if (!member) return signInAgain();
	const today = todayIn(env.TIMEZONE);
	const since = addDays(today, -PAST_DAYS);
	const [tasks, board, meetings] = await Promise.all([
		all<TaskRow>(
			env.DB,
			`${TASK_SELECT} WHERE t.assignee_id = ?1 AND (t.status = 'open' OR (t.status = 'done' AND t.completed_at >= ?2)) ORDER BY t.status = 'done', t.due_date, t.id`,
			member.id,
			since
		),
		boardTasks(env.DB, member.id, { assignee: member.id, openOrDoneSince: since }),
		all<MeetingRow>(env.DB, MY_MEETINGS, member.id, since, addDays(today, AHEAD_DAYS), member.role)
	]);
	return json({
		member: memberJson(member),
		today,
		timezone: env.TIMEZONE,
		app_url: env.APP_URL,
		tasks: [...tasks.map((t) => taskJson(t, env.APP_URL)), ...board.filter((b) => b.status !== 'dropped').map((b) => boardJson(b, env.APP_URL))].sort(
			(a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.due_date.localeCompare(b.due_date)
		),
		meetings: meetings.map((m) => meetingJson(m, env.APP_URL))
	});
}
