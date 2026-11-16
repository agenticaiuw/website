import { Hono } from 'hono';
import { boardTasks } from '../board';
import { addDays, formatDate, formatTimeRange, todayIn } from '../dates';
import { all, first, groupStats, MEETING_SELECT, MEETING_VISIBLE, run, TASK_SELECT, teamNames, visible } from '../db';
import { readForm, str } from '../form';
import { canAssign, isExec } from '../perm';
import type { AppEnv, MeetingRow, TaskRow, Team } from '../types';
import { page } from '../views/layout';
import { BoardTaskList } from '../views/board';
import { collapseTasks, Empty, Field, PageHead, TaskList } from '../views/ui';
import type { TeamMemberRow } from './people';

export const homeRoutes = new Hono<AppEnv>();

homeRoutes.post('/availability', async (c) => {
	const raw = (await readForm(c)).hours;
	if (typeof raw !== 'string' || raw.length > 32) return c.redirect('/?error=hours');
	const value = str(raw);
	const hours = value === '' ? null : Number(value);
	if (hours !== null && (!/^\d+(\.\d+)?$/.test(value) || hours < 0 || hours > 168)) return c.redirect('/?error=hours');
	await run(c.env.DB, 'UPDATE members SET available_hours = ? WHERE id = ?', hours, c.get('viewer').id);
	return c.redirect('/?ok=saved');
});

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
								{m.kind === 'event' ? 'Club event' : teamNames(m)}
								{m.time && ` · ${formatTimeRange(m.time, m.end_time)}`}
								{m.location && ` · ${m.location}`}
								{m.host_name && ` · Host: ${m.host_name}`}
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
		all<Team>(db, 'SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE tm.member_id = ? AND t.archived = 0 ORDER BY t.kind = \'exec\' DESC, t.name COLLATE NOCASE', v.id),
		all<TeamMemberRow>(db, `SELECT x.team_id, x.member_id, x.is_lead, x.title, m.name, m.role FROM team_members x JOIN members m ON m.id = x.member_id
		 WHERE m.active = 1 AND x.team_id IN (SELECT team_id FROM team_members WHERE member_id = ?) ORDER BY m.role = 'exec' DESC, x.is_lead DESC, x.title = '', m.name COLLATE NOCASE`, v.id)
	]);

	const groups = await groupStats(db, assignedByMe);
	const waiting = collapseTasks(assignedByMe, v.id).length;
	const overdue = mine.filter((t) => t.due_date < today);
	const thisWeek = mine.filter((t) => t.due_date >= today && t.due_date <= weekOut);
	const later = mine.filter((t) => t.due_date > weekOut);
	const openCount = mine.length + shared.length;
	const overdueCount = overdue.length + shared.filter((t) => t.due_date < today).length;
	const firstName = v.name.split(' ')[0];
	const myRow = (team: number) => teamMembers.find((m) => m.team_id === team && m.member_id === v.id);

	return page(
		c,
		{ title: 'My work', active: 'home' },
		<>
			<PageHead
				eyebrow={formatDate(today)}
				title={`Hi, ${firstName}`}
				sub={openCount ? `You have ${openCount} open task${openCount === 1 ? '' : 's'}${overdueCount ? `, ${overdueCount} overdue` : ''}.` : "You're all caught up."}
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

			<div class="grid-2 wide-left">
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
					{shared.length > 0 && (
						<>
							<h2 class="section-title">
								Team boards <span class="count">{shared.length}</span>
							</h2>
							<BoardTaskList tasks={shared} viewer={v} today={today} back="/" />
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
					<h2 class="section-title">My teams</h2>
					{myTeams.length ? (
						<ul class="my-team-list card">
							{myTeams.map((t) => {
								const me = myRow(t.id);
								const role = v.role === 'exec' ? 'Exec' : me?.is_lead ? 'Lead' : '';
								return (
									<li>
										<a href={`/teams/${t.id}`}>{t.name}</a>
										<span class="muted">{[me?.title, role].filter(Boolean).join(' · ') || `${teamMembers.filter((m) => m.team_id === t.id).length} people`}</span>
									</li>
								);
							})}
						</ul>
					) : (
						<Empty>You're not on a team yet.</Empty>
					)}
					<p class="hours-line">
						{v.available_hours == null ? 'Your weekly hours aren’t set.' : <>You’re available <b>{v.available_hours} h</b> a week.</>}{' '}
						<button type="button" class="link-btn" aria-haspopup="dialog" aria-controls="edit-availability" data-members-dialog="edit-availability">
							{v.available_hours == null ? 'Set them' : 'Change'}
						</button>
					</p>
					<dialog id="edit-availability" class="members-dialog" aria-labelledby="edit-availability-title">
						<div class="members-dialog-content stack">
							<header>
								<h2 id="edit-availability-title">Hours you can give each week</h2>
								<form method="dialog">
									<button class="btn small">Close</button>
								</form>
							</header>
							<form class="stack" method="post" action="/availability">
								<Field label="Hours per week" hint="Leads see this when planning team work.">
									<input type="number" name="hours" min="0" max="168" step="any" value={v.available_hours ?? ''} />
								</Field>
								<div>
									<button class="btn small primary">Save</button>
								</div>
							</form>
						</div>
					</dialog>
					<h2 class="section-title">Recent meetings</h2>
					<MeetingList meetings={recent} today={today} />
				</aside>
			</div>
		</>
	);
});
