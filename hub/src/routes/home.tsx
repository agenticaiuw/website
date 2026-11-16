import { Hono } from 'hono';
import { boardTasks } from '../board';
import { addDays, formatDate, formatTimeRange, todayIn } from '../dates';
import { activeMembers, all, first, groupStats, MEETING_SELECT, MEETING_VISIBLE, run, TASK_SELECT, teamNames, visible } from '../db';
import { readForm, str } from '../form';
import { canAssign, isExec } from '../perm';
import type { AppEnv, MeetingRow, TaskRow, Team } from '../types';
import { page } from '../views/layout';
import { BoardTaskList } from '../views/board';
import { collapseTasks, Empty, Field, PageHead, TaskList } from '../views/ui';
import { TeamCard, type TeamMemberRow } from './people';

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

	const [mine, recentDone, assignedByMe, upcoming, recent, clubOverdue, shared, myTeams, teamMembers, activePeople] = await Promise.all([
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
		all<Team>(db, 'SELECT t.* FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE tm.member_id = ? AND t.archived = 0 ORDER BY t.name COLLATE NOCASE', v.id),
		all<TeamMemberRow>(db, `SELECT x.team_id, x.member_id, x.is_lead, x.title, m.name, m.role FROM team_members x JOIN members m ON m.id = x.member_id
		 WHERE m.active = 1 AND x.team_id IN (SELECT team_id FROM team_members WHERE member_id = ?) ORDER BY m.role = 'exec' DESC, x.is_lead DESC, x.title = '', m.name COLLATE NOCASE`, v.id),
		isExec(v) ? activeMembers(db) : Promise.resolve([])
	]);

	const groups = await groupStats(db, assignedByMe);
	const waiting = collapseTasks(assignedByMe, v.id).length;
	const overdue = mine.filter((t) => t.due_date < today);
	const thisWeek = mine.filter((t) => t.due_date >= today && t.due_date <= weekOut);
	const later = mine.filter((t) => t.due_date > weekOut);
	const openCount = mine.length + shared.length;
	const overdueCount = overdue.length + shared.filter((t) => t.due_date < today).length;
	const firstName = v.name.split(' ')[0];

	return page(
		c,
		{ title: 'My work', active: 'home' },
		<>
			<PageHead
				eyebrow={formatDate(today)}
				title={<span class="home-greeting">Hi, {firstName} <span class="home-hours">{v.available_hours == null ? 'Hours not set' : `${v.available_hours} hours/week`}
					<button type="button" class="icon-btn" aria-label="Edit available hours" title="Edit available hours" aria-haspopup="dialog" aria-controls="edit-availability" data-members-dialog="edit-availability">
						<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
					</button></span></span>}
				sub={openCount ? `You have ${openCount} open task${openCount === 1 ? '' : 's'}${overdueCount ? `, ${overdueCount} overdue` : ''}.` : undefined}
				actions={
					<><a class="btn" href={'/tasks?status=open&team=mine'}>Pick a task</a><a class="btn primary" href="/tasks/new">
						New task
					</a></>
				}
			/>
			<dialog id="edit-availability" class="members-dialog" aria-labelledby="edit-availability-title">
				<div class="members-dialog-content stack">
					<header><h2 id="edit-availability-title">Available hours per week</h2><form method="dialog"><button class="btn small">Close</button></form></header>
					<form class="stack" method="post" action="/availability">
						<Field label="Hours per week"><input type="number" name="hours" min="0" max="168" step="any" value={v.available_hours ?? ''} /></Field>
						<div><button class="btn small primary">Save</button></div>
					</form>
				</div>
			</dialog>
			{clubOverdue && clubOverdue.n > 0 && <p class="home-club-overdue"><a href="/people">Club overdue tasks <span class="count">{clubOverdue.n}</span></a></p>}
			<div class="home-dashboard">
				<section class="home-due" aria-label="Upcoming deadlines">
					<h2 class="section-title">
						Due in the next 7 days {thisWeek.length > 0 && <span class="count">{thisWeek.length}</span>}
					</h2>
					<TaskList tasks={thisWeek} today={today} viewer={v} show={['team', 'meeting']} back="/" empty="Nothing due in the next 7 days" />
				</section>
			<section class="my-teams home-teams" aria-labelledby="my-teams-heading">
				<h2 class="section-title" id="my-teams-heading">My teams <a class="btn small" href="/teams">Browse teams</a></h2>
				<div class="my-teams-links">
					{myTeams.length ? <div class="teams">{myTeams.map((team) => <TeamCard team={team} links={teamMembers} people={activePeople} teamList={myTeams} editable={isExec(v)} />)}</div> : <Empty>You are not on a team yet.</Empty>}
				</div>
			</section>
				<section class="home-other" aria-label="Other tasks">
					{shared.length > 0 && <>
						<h2 class="section-title">Team board tasks</h2>
						<BoardTaskList tasks={shared} viewer={v} today={today} back="/" />
					</>}
					{overdue.length > 0 && (
						<>
							<h2 class="section-title bad">
								Overdue <span class="count">{overdue.length}</span>
							</h2>
							<TaskList tasks={overdue} today={today} viewer={v} show={['team', 'meeting']} back="/" />
						</>
					)}
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
				<aside class="home-meetings">
					<h2 class="section-title">Upcoming meetings</h2>
					<MeetingList meetings={upcoming} today={today} />
					<h2 class="section-title home-recent-heading">Recent meetings</h2>
					<div class="home-recent"><MeetingList meetings={recent} today={today} /></div>
				</aside>
			</div>
		</>
	);
});
