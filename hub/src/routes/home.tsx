import { Hono } from 'hono';
import { addDays, formatDate, formatTimeRange, todayIn } from '../dates';
import { all, first, groupStats, MEETING_SELECT, MEETING_VISIBLE, TASK_SELECT, visible } from '../db';
import { canAssign, isExec } from '../perm';
import type { AppEnv, MeetingRow, TaskRow } from '../types';
import { page } from '../views/layout';
import { collapseTasks, Empty, PageHead, TaskList } from '../views/ui';

export const homeRoutes = new Hono<AppEnv>();

export function MeetingList({ meetings, today }: { meetings: MeetingRow[]; today: string }) {
	if (!meetings.length) return <Empty>Nothing yet.</Empty>;
	return (
		<ul class="meetings">
			{meetings.map((m) => (
				<li>
					<a href={`/meetings/${m.id}`}>
						<span class="m-date">
							<b>{formatDate(m.date, today).split(', ')[1]}</b>
							<small>{formatDate(m.date, today).split(', ')[0]}</small>
						</span>
						<span class="m-body">
							<span class="m-title">{m.title}</span>
							<span class="m-meta">
								{m.kind === 'event' ? 'Club event' : m.team_name}
								{m.time && ` · ${formatTimeRange(m.time, m.end_time)}`}
								{m.location && ` · ${m.location}`}
							</span>
						</span>
					</a>
				</li>
			))}
		</ul>
	);
}

homeRoutes.get('/', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const today = todayIn(c.env.TIMEZONE);
	const weekOut = addDays(today, 7);

	const [mine, recentDone, assignedByMe, upcoming, recent, clubOverdue] = await Promise.all([
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
		isExec(v) ? first<{ n: number; people: number }>(db, "SELECT COUNT(*) AS n, COUNT(DISTINCT assignee_id) AS people FROM tasks WHERE status = 'open' AND due_date < ?", today) : Promise.resolve(null)
	]);

	const groups = await groupStats(db, assignedByMe);
	const waiting = collapseTasks(assignedByMe, v.id).length;
	const overdue = mine.filter((t) => t.due_date < today);
	const thisWeek = mine.filter((t) => t.due_date >= today && t.due_date <= weekOut);
	const later = mine.filter((t) => t.due_date > weekOut);
	const firstName = v.name.split(' ')[0];

	return page(
		c,
		{ title: 'My work', active: 'home' },
		<>
			<PageHead
				eyebrow={formatDate(today)}
				title={`Hi, ${firstName}`}
				sub={mine.length ? `You have ${mine.length} open task${mine.length === 1 ? '' : 's'}${overdue.length ? `, ${overdue.length} overdue` : ''}.` : "You're all caught up."}
				actions={
					<a class="btn primary" href="/tasks/new">
						New task
					</a>
				}
			/>
			{clubOverdue && clubOverdue.n > 0 && (
				<p class="callout">
					Across the club, <b>{clubOverdue.n}</b> task{clubOverdue.n === 1 ? ' is' : 's are'} overdue among <b>{clubOverdue.people}</b> {clubOverdue.people === 1 ? 'person' : 'people'}. <a href="/people">See who</a>
				</p>
			)}

			<div class="grid-2">
				<section>
					{overdue.length > 0 && (
						<>
							<h2 class="section-title bad">
								Overdue <span class="count">{overdue.length}</span>
							</h2>
							<TaskList tasks={overdue} today={today} viewer={v} show={['team', 'meeting']} back="/" />
						</>
					)}
					<h2 class="section-title">
						Due in the next 7 days {thisWeek.length > 0 && <span class="count">{thisWeek.length}</span>}
					</h2>
					<TaskList tasks={thisWeek} today={today} viewer={v} show={['team', 'meeting']} back="/" empty="Nothing due this week." />
					{later.length > 0 && (
						<>
							<h2 class="section-title">
								Later <span class="count">{later.length}</span>
							</h2>
							<TaskList tasks={later} today={today} viewer={v} show={['team', 'meeting']} back="/" />
						</>
					)}
					{assignedByMe.length > 0 && (
						<>
							<h2 class="section-title">
								Waiting on others <span class="count">{waiting}</span>
							</h2>
							<TaskList tasks={assignedByMe} today={today} viewer={v} show={['assignee', 'team']} back="/" groups={groups} />
						</>
					)}
					{recentDone.length > 0 && (
						<>
							<h2 class="section-title">Recently done</h2>
							<TaskList tasks={recentDone} today={today} viewer={v} show={['team']} back="/" />
						</>
					)}
				</section>
				<aside>
					<h2 class="section-title">Coming up</h2>
					<MeetingList meetings={upcoming} today={today} />
					<h2 class="section-title">Recent meetings</h2>
					<MeetingList meetings={recent} today={today} />
				</aside>
			</div>
		</>
	);
});
