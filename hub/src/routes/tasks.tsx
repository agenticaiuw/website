import { Hono } from 'hono';
import { safeRedirect } from '../auth';
import { BOARD_STATUSES, boardTasks } from '../board';
import { addDays, formatDate, formatTimestamp, isDate, todayIn } from '../dates';
import { activeMembers, all, first, groupStats, logTask, memberById, nowIso, run, setTaskStatus, TASK_ON_TEAM, TASK_SELECT, TASK_VISIBLE, taskById, teams, teamsByMember, visible } from '../db';
import { id, list, readForm, str, withNotice } from '../form';
import { canAssign, canCompleteTask, canManageTask, canSeeTask, isExec, teamsFor } from '../perm';
import { notifyAssigned, notifyDueChanged, notifyTaskEnded } from '../reminders';
import type { AppEnv, Member, Task, TaskRow, TaskStatus, Team, Viewer } from '../types';
import { page } from '../views/layout';
import { BoardTaskList } from '../views/board';
import { DoneMark, individualStage, MoveCard } from '../views/task-stage';
import { Choice, Due, Field, Markdown, MemberSelect, PageHead, PeoplePicker, PostButton, Tabs, TaskList, TeamSelect } from '../views/ui';
import { loadMeeting } from './meeting-access';

export const taskRoutes = new Hono<AppEnv>();

// ---------- list ----------

taskRoutes.get('/tasks', async (c) => {
	const v = c.get('viewer');
	const today = todayIn(c.env.TIMEZONE);
	const status = c.req.query('status') ?? 'open';
	const assignee = id(c.req.query('assignee'));
	const team = id(c.req.query('team'));
	const q = (c.req.query('q') ?? '').trim().slice(0, 100);

	const where = ['1 = 1'];
	const params: (string | number)[] = [];
	const bind = (value: string | number) => `?${params.push(value)}`;
	if (status === 'open') where.push("t.status = 'open'");
	else if (status === 'overdue') where.push(`t.status = 'open' AND t.due_date < ${bind(today)}`);
	else if (status === 'done') where.push("t.status = 'done'");
	else if (status === 'dropped') where.push("t.status = 'dropped'");
	if (assignee) where.push(`t.assignee_id = ${bind(assignee)}`);
	if (team) where.push(TASK_ON_TEAM(params.push(team)));
	if (q) where.push(`(t.title LIKE ${bind(`%${q}%`)} OR t.details LIKE ?${params.length})`);
	const order = status === 'done' || status === 'dropped' ? 't.completed_at DESC, t.updated_at DESC' : 't.due_date, t.id';

	const [tasks, people, teamList, sharedTasks] = await Promise.all([
		all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 300`, ...params),
		activeMembers(c.env.DB),
		teams(c.env.DB),
		boardTasks(c.env.DB, v.id, { team, assignee, status, q, today })
	]);
	const groups = await groupStats(c.env.DB, tasks);
	const visibleTasks = tasks.map((task) => canSeeTask(v, task) ? task : { ...task, meeting_title: null });
	const back = c.req.url.replace(new URL(c.req.url).origin, '');
	const withStatus = (s: string | null) => {
		const u = new URL(c.req.url);
		u.searchParams.set('status', s ?? 'open');
		return u.pathname + u.search;
	};

	return page(
		c,
		{ title: 'Tasks', active: 'tasks' },
		<>
			<PageHead
				title="Tasks"
				sub="Every task in the club."
				actions={
					<a class="btn primary" href="/tasks/new">
						New task
					</a>
				}
			/>
			<form class="toolbar" method="get" action="/tasks" data-autosubmit>
				<input type="hidden" name="status" value={status} />
				<Tabs
					label="Status"
					current={status}
					href={withStatus}
					options={[
						['open', 'Open'],
						['overdue', 'Overdue'],
						['done', 'Done'],
						['dropped', 'Dropped'],
						['all', 'All']
					]}
				/>
				<MemberSelect name="assignee" members={people} selected={assignee} blank="Anyone" label="Assignee" />
				<select name="team" aria-label="Team">
					<option value="" selected={!team}>Any team</option>
					{teamList.map((t) => <option value={String(t.id)} selected={team === t.id}>{t.name}</option>)}
				</select>
				<input type="search" name="q" value={q} placeholder="Search tasks" aria-label="Search tasks" />
				<button class="btn js-hide">Filter</button>
			</form>
			{sharedTasks.length > 0 && <BoardTaskList tasks={sharedTasks} viewer={v} today={today} back={back} />}
			{(visibleTasks.length > 0 || !sharedTasks.length) && <TaskList tasks={visibleTasks} today={today} viewer={v} show={['assignee', 'team', 'meeting']} back={back} empty="No tasks match." groups={groups} />}
		</>
	);
});

// ---------- create ----------

function assignableTeams(v: Viewer, all: Team[]) {
	// Anyone can file a task for themselves under a team they're on.
	return isExec(v) ? all : all.filter((t) => v.leadOf.has(t.id) || (t.kind === 'project' && v.teamIds.has(t.id)));
}

taskRoutes.get('/tasks/new', async (c) => {
	const v = c.get('viewer');
	const today = todayIn(c.env.TIMEZONE);
	const [people, teamList, teamsOf] = await Promise.all([activeMembers(c.env.DB), teams(c.env.DB), teamsByMember(c.env.DB)]);
	const onTeam = (memberId: number, teamId: number) => teamsOf.get(memberId)?.includes(teamId) ?? false;
	const pickTeams = teamsFor(v, teamList).filter((t) => people.some((p) => onTeam(p.id, t.id)));
	const preTeam = id(c.req.query('team'));
	const preAssignee = id(c.req.query('assignee'));
	const picked = new Set(preTeam ? people.filter((p) => onTeam(p.id, preTeam)).map((p) => p.id) : [preAssignee ?? v.id]);
	return page(
		c,
		{ title: 'New task', active: 'tasks' },
		<>
			<PageHead eyebrow="Tasks" title="New task" sub={canAssign(v) ? 'Give it to one person or a whole team. Each person is emailed and reminded until they’re done, and you see everyone’s progress on one task.' : 'Track something you committed to. You’ll get reminders before it’s due.'}
				actions={<a class="btn" href="/teams">Create a shared team task</a>} />
			<form method="post" action="/tasks" class="card form-grid">
				<div class="field wide">
					<span class="label">What needs to happen</span>
					<div class="action-rows" data-rows>
						<div class="task-row" data-row>
							<input name="title" required maxlength={200} placeholder="e.g. Order the nRF52 dev boards" aria-label="Task" />
							<input type="date" name="due_date" required value={addDays(today, 7)} min={addDays(today, -365)} aria-label="Due date" />
						</div>
					</div>
					<div>
						<button type="button" class="btn ghost small js-only" data-add-row>
							+ Another task
						</button>
					</div>
					<span class="hint">Each line is its own task with its own due date. Everyone you pick gets every task, in one email.</span>
				</div>
				<Field label="Details" hint="Optional. Links, context, what “done” looks like. With several tasks, each one gets these details." wide>
					<textarea name="details" rows={4}></textarea>
				</Field>
				{canAssign(v) ? (
					<PeoplePicker
						label="Assign to"
						hint={`Tick a team to add everyone on it, then untick anyone who isn’t needed. Each person’s task goes under their team.${isExec(v) ? '' : ' You can assign people on the teams you lead.'}`}
						teams={pickTeams}
						pickedTeams={new Set(preTeam ? [preTeam] : [])}
						people={people}
						picked={picked}
						teamsOf={teamsOf}
						personName="assignee"
					/>
				) : (
					<input type="hidden" name="assignee" value={String(v.id)} />
				)}
				{!canAssign(v) && (
					<Field label="Team">
						<TeamSelect name="team" teams={assignableTeams(v, teamList)} selected={preTeam} blank="No team" />
					</Field>
				)}
				<RepeatFields days={0} until={null} />
				<label class="check wide">
					<input type="checkbox" name="urgent" value="1" />
					Urgent: extra reminders the evening it’s due, then every 2 hours while overdue
				</label>
				<div class="form-actions wide">
					<button class="btn primary">Create task</button>
					<a class="btn ghost" href="/tasks">
						Cancel
					</a>
				</div>
			</form>
		</>
	);
});

/**
 * Validates and inserts tasks, one per assignee. Shared with meeting action items.
 * Returns the new ids, or an error code for the redirect.
 */
export async function createTasks(
	env: AppEnv['Bindings'],
	v: Viewer,
	input: { title: string; details: string; assignees: number[]; due: string; teamId: number | null; teamOf?: (assignee: number) => number | null; meetingId: number | null; urgent?: boolean; repeatDays?: number; repeatUntil?: string | null }
): Promise<{ ids: number[] } | { error: string }> {
	if (!input.title || !input.assignees.length) return { error: 'missing' };
	if (!isDate(input.due)) return { error: 'date' };
	const teamOf = input.teamOf ?? (() => input.teamId);
	const assignees = [...new Set(input.assignees)];
	// Others' tasks go under a team you lead; your own under no team or one you're on.
	if (!isExec(v)) {
		for (const a of assignees) {
			const team = teamOf(a);
			if (a !== v.id ? !(team && v.leadOf.has(team)) : team !== null && !v.teamIds.has(team)) return { error: 'forbidden' };
		}
	}
	const ids: number[] = [];
	for (const assignee of assignees) {
		const person = await memberById(env.DB, assignee);
		if (!person || !person.active) continue;
		const res = await run(
			env.DB,
			'INSERT INTO tasks (title, details, assignee_id, assigned_by, team_id, meeting_id, due_date, urgent, repeat_days, repeat_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			input.title,
			input.details,
			assignee,
			v.id,
			teamOf(assignee),
			input.meetingId,
			input.due,
			input.urgent ? 1 : 0,
			input.repeatDays ?? 0,
			input.repeatUntil ?? null
		);
		const taskId = Number(res.meta.last_row_id);
		ids.push(taskId);
		await logTask(env.DB, taskId, v.id, 'created', assignee === v.id ? '' : `Assigned to ${person.name}, due ${formatDate(input.due)}`).run();
	}
	if (ids.length > 1) await run(env.DB, 'UPDATE tasks SET group_id = ? WHERE id IN (SELECT value FROM json_each(?))', ids[0], JSON.stringify(ids));
	return ids.length ? { ids } : { error: 'missing' };
}

taskRoutes.post('/tasks', async (c) => {
	const v = c.get('viewer');
	const form = await readForm(c);
	const assignees = list(form.assignee).map(Number).filter((n) => Number.isInteger(n) && n > 0);
	// The teams ticked, in form order. Each person's task goes under the first one they're on.
	const picked = [...new Set(list(form.team).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
	// A lead who ticked people one by one files them under a team they lead.
	const led = isExec(v) ? [] : [...v.leadOf];
	const teamsOf = picked.length > 1 || (!picked.length && led.length) ? await teamsByMember(c.env.DB) : new Map<number, number[]>();
	const on = (a: number) => (t: number) => teamsOf.get(a)?.includes(t) ?? false;
	// One task per line that has a title, each with its own due date.
	const dues = list(form.due_date);
	const rows = list(form.title)
		.map((title, i) => ({ title: title.slice(0, 200), due: dues[i] ?? '' }))
		.filter((r) => r.title);
	if (!rows.length) return c.redirect('/tasks/new?error=missing');
	if (rows.some((r) => !isDate(r.due))) return c.redirect('/tasks/new?error=date');
	const ids: number[] = [];
	for (const row of rows) {
		const result = await createTasks(c.env, v, {
			title: row.title,
			details: str(form.details, 10_000),
			assignees: canAssign(v) ? assignees : [v.id],
			due: row.due,
			teamId: picked[0] ?? null,
			teamOf: (a) => picked.find(on(a)) ?? picked[0] ?? (a === v.id ? null : (led.find(on(a)) ?? led[0] ?? null)),
			meetingId: null,
			urgent: str(form.urgent) === '1',
			...readRepeat(form, row.due)
		});
		if ('error' in result) return c.redirect(ids.length ? '/tasks?error=partial' : `/tasks/new?error=${result.error}`);
		ids.push(...result.ids);
	}
	// Each person gets one email listing all of their new tasks.
	await notifyAssigned(c.env, v, ids);
	if (rows.length > 1) {
		const people = [...new Set(canAssign(v) ? assignees : [v.id])];
		return c.redirect(people.length === 1 ? `/tasks?assignee=${people[0]}&ok=tasks-created` : '/tasks?ok=tasks-created');
	}
	if (ids.length === 1) return c.redirect(`/tasks/${ids[0]}?ok=created`);
	// Several people: your own copy if you're one of them, otherwise the overview of everyone.
	const own = await first<{ id: number }>(c.env.DB, 'SELECT id FROM tasks WHERE id IN (SELECT value FROM json_each(?)) AND assignee_id = ?', JSON.stringify(ids), v.id);
	return c.redirect(own ? `/tasks/${own.id}?ok=assigned` : `/tasks/${ids[0]}?all=1&ok=assigned`);
});

/** How often a task can repeat. On each one's due date the next is made and everyone on it is emailed. */
const TASK_REPEATS: [string, string][] = [
	['0', 'Doesn’t repeat'],
	['1', 'Daily'],
	['7', 'Weekly'],
	['14', 'Every 2 weeks']
];

function RepeatFields({ days, until }: { days: number; until: string | null }) {
	return (
		<>
			<Choice name="repeat" label="Repeats" selected={String(days)} options={TASK_REPEATS} hint="Weekly ones: on each due date the next one is made and everyone on it is emailed. Daily ones: each day’s is made that morning and comes in the 9 AM reminder email." />
			<label class="field until">
				<span class="label">Until</span>
				<input type="date" name="repeat_until" value={until ?? ''} />
				<span class="hint">Optional. Leave it blank to keep going until someone stops it.</span>
			</label>
		</>
	);
}

/** The repeat fields from a form: days (0 = doesn't repeat) and an optional end date. */
function readRepeat(form: Record<string, unknown>, due: string) {
	const days = Number(str(form.repeat));
	const repeatDays = days === 1 || days === 7 || days === 14 ? days : 0;
	const until = str(form.repeat_until);
	return { repeatDays, repeatUntil: repeatDays && isDate(until) && until >= due ? until : null };
}

const repeatLabel = (days: number) => (days === 1 ? 'Every day' : days === 14 ? 'Every 2 weeks' : 'Every week');

const repeatText = (t: { repeat_days: number; repeat_until: string | null }, today: string) =>
	`${repeatLabel(t.repeat_days)}${t.repeat_until ? `, until ${formatDate(t.repeat_until, today)}` : ''}`;

// ---------- detail ----------

type Activity = { id: number; kind: string; body: string; created_at: string; member_name: string | null };

const ACTIVITY_VERB: Record<string, string> = {
	created: 'created this task',
	comment: 'commented',
	done: 'marked it done',
	reopened: 'reopened it',
	dropped: 'dropped it',
	edited: 'edited it',
	due_changed: 'changed the due date',
	reassigned: 'reassigned it',
	progress: 'moved it to In progress',
	unassigned: 'took someone off it'
};

async function loadTask(c: { env: AppEnv['Bindings'] }, raw: string) {
	const taskId = id(raw);
	return taskId ? taskById(c.env.DB, taskId) : null;
}

taskRoutes.get('/tasks/:id', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task) return c.notFound();
	const today = todayIn(c.env.TIMEZONE);
	const [activity, copies, meeting] = await Promise.all([
		all<Activity>(
			c.env.DB,
			`SELECT a.id, a.kind, a.body, a.created_at, m.name AS member_name
			 FROM task_activity a LEFT JOIN members m ON m.id = a.member_id
			 WHERE a.task_id = ? ORDER BY a.created_at, a.id`,
			task.id
		),
		task.group_id ? all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE t.group_id = ? ORDER BY a.name COLLATE NOCASE`, task.group_id) : Promise.resolve([]),
		task.meeting_id ? loadMeeting(c, v, String(task.meeting_id)) : null
	]);
	const back = `/tasks/${task.id}`;
	// A shared task: everyone's copy, each with its own tick. With ?all=1 the page is an overview
	// for someone who isn't on it; otherwise it's about this one person's copy.
	const everyone = copies;
	const shared = everyone.length > 1;
	const overview = shared && c.req.query('all') === '1';
	const total = copies.filter((t) => t.status !== 'dropped').length;
	const done = copies.filter((t) => t.status === 'done').length;
	const team = task.team_name ?? 'Task';
	const progress = shared && (
		<>
			<h2 class="section-title" id="everyone">
				Everyone{' '}
				<span class="count">
					{done} of {total} done
				</span>
			</h2>
			<TaskList tasks={everyone} today={today} viewer={v} show={[]} by="assignee" back={overview ? `${back}?all=1` : `${back}#everyone`} removable={copies.length > 1} />
		</>
	);
	return page(
		c,
		{ title: task.title, active: 'tasks' },
		<>
			<PageHead
				eyebrow={shared && !overview && task.assignee_id !== v.id ? `${team} · ${task.assignee_name}’s copy` : team}
				title={task.title}
				actions={
					<>
						{!overview && task.status !== 'done' && canCompleteTask(v, task) && <MoveCard action={`/tasks/${task.id}/board-move`} status={individualStage(task)} title={task.title} back={back} />}
						{canManageTask(v, task) && (
							<a class="btn" href={`/tasks/${task.id}/edit`}>
								Edit
							</a>
						)}
					</>
				}
			/>
			<div class="grid-2 wide-left">
				<section>
					<dl class="facts card">
						<div>
							<dt>{overview ? 'Progress' : 'Status'}</dt>
							<dd>{overview ? `${done} of ${total} done` : <span class="task-title-line">{task.status === 'done' ? (canCompleteTask(v, task) ? <MoveCard action={`/tasks/${task.id}/board-move`} status="done" title={task.title} back={back} /> : <DoneMark />) : BOARD_STATUSES.find(([status]) => status === individualStage(task))?.[1]}</span>}</dd>
						</div>
						<div>
							<dt>Due</dt>
							<dd>{formatDate(task.due_date, today)}</dd>
						</div>
						{task.repeat_days > 0 && (
							<div>
								<dt>Repeats</dt>
								<dd>
									{repeatText(task, today)}
									{task.repeated ? ' · the next one has been made' : ' · the next one is made on the due date'}
								</dd>
							</div>
						)}
						{!!task.urgent && (
							<div>
								<dt>Urgent</dt>
								<dd>Reminded every 2 hours once due{task.urgent_until ? `, until ${formatTimestamp(task.urgent_until, c.env.TIMEZONE)}` : ''}</dd>
							</div>
						)}
						<div>
							<dt>Assigned to</dt>
							<dd>{overview ? `${copies.length} people` : <a href={`/people/${task.assignee_id}`}>{task.assignee_id === v.id ? 'You' : task.assignee_name}</a>}</dd>
						</div>
						<div>
							<dt>Assigned by</dt>
							<dd>{task.assigner_name ?? '—'}</dd>
						</div>
						{meeting && (
							<div>
								<dt>From meeting</dt>
								<dd>
									<a href={`/meetings/${meeting.id}`}>{meeting.title}</a>
								</dd>
							</div>
						)}
						{!overview && (
							<div>
								<dt>Reminders sent</dt>
								<dd>{task.reminders_sent}</dd>
							</div>
						)}
					</dl>
					<h2 class="section-title">Details</h2>
					<Markdown text={task.details} empty="No details." />
					{!overview && progress}
				</section>
				{overview ? (
					<section>{progress}</section>
				) : (
					<section>
						<h2 class="section-title">Activity</h2>
						<ol class="timeline">
							{activity.map((a) => (
								<li class={`ev ${a.kind}`}>
									<div class="ev-head">
										<b>{a.member_name ?? 'Hub'}</b> {a.member_name ? (ACTIVITY_VERB[a.kind] ?? a.kind) : ''}
										<time>{formatTimestamp(a.created_at, c.env.TIMEZONE)}</time>
									</div>
									{a.body && (a.kind === 'comment' ? <Markdown text={a.body} /> : <p class="ev-body">{a.body}</p>)}
								</li>
							))}
						</ol>
						{canSeeTask(v, task) && <form method="post" action={`/tasks/${task.id}/comment`} class="stack">
							<label class="field">
								<span class="label">Add a comment</span>
								<textarea name="body" rows={3} required placeholder="Progress, blockers, a link to the result…"></textarea>
							</label>
							<div>
								<button class="btn">Comment</button>
							</div>
						</form>}
					</section>
				)}
			</div>
		</>
	);
});

taskRoutes.post('/tasks/:id/board-move', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task || !canCompleteTask(v, task)) return c.notFound();
	const form = await readForm(c);
	const next = BOARD_STATUSES.find(([status]) => status === str(form.status));
	const back = safeRedirect(str(form.back) || `/tasks/${task.id}`);
	if (!next) return c.redirect(withNotice(back, 'error', 'missing'));
	const status = next[0] === 'in_progress' ? 'open' : next[0];
	const inProgress = next[0] === 'in_progress';
	if (status !== task.status || inProgress !== !!task.board_in_progress) {
		await setTaskStatus(c.env.DB, task.id, status, v.id, '', inProgress);
	}
	return c.redirect(withNotice(back, 'ok', 'saved'));
});

taskRoutes.post('/tasks/:id/status', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task) return c.notFound();
	const form = await readForm(c);
	const status = str(form.status) as TaskStatus;
	// Only the assignee (or an exec) marks it done; whoever manages it can also drop it.
	const allowed = ['dropped', 'done', 'open'].includes(status) && (canCompleteTask(v, task) || (status === 'dropped' && canManageTask(v, task)));
	const back = safeRedirect(str(form.back) || `/tasks/${task.id}`);
	if (!allowed) return c.redirect(withNotice(back, 'error', 'forbidden'));
	if (status === 'dropped' && str(form.all) === '1' && task.group_id && canManageTask(v, task)) {
		const open = await all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE t.group_id = ? AND t.status = 'open'`, task.group_id);
		for (const t of open) await setTaskStatus(c.env.DB, t.id, 'dropped', v.id);
		await notifyTaskEnded(c.env, v, open, 'dropped');
	} else if (task.status !== status) {
		await setTaskStatus(c.env.DB, task.id, status, v.id);
		if (status === 'dropped') await notifyTaskEnded(c.env, v, [task], 'dropped');
	}
	return c.redirect(withNotice(back, 'ok', { done: 'done', open: 'reopened', dropped: 'dropped' }[status]));
});

taskRoutes.post('/tasks/:id/comment', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task || !canSeeTask(v, task)) return c.notFound();
	const body = str((await readForm(c)).body, 5000);
	if (body) await logTask(c.env.DB, task.id, v.id, 'comment', body).run();
	return c.redirect(`/tasks/${task.id}?ok=commented`);
});

/** Takes one person off a shared task: their copy and its history go, the others stay. */
taskRoutes.post('/tasks/:id/remove', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task) return c.notFound();
	if (!canManageTask(v, task)) return c.redirect(`/tasks/${task.id}?error=forbidden`);
	const others = task.group_id ? await all<{ id: number }>(c.env.DB, 'SELECT id FROM tasks WHERE group_id = ? AND id != ? ORDER BY id', task.group_id, task.id) : [];
	// Someone has to be on a task: with just one person, reassign or drop it instead.
	if (!others.length) return c.redirect(`/tasks/${task.id}?error=last`);
	const db = c.env.DB;
	await db.batch([db.prepare('DELETE FROM tasks WHERE id = ?').bind(task.id), ...others.map((o) => logTask(db, o.id, v.id, 'unassigned', `${task.assignee_name} is no longer on this task.`))]);
	await notifyTaskEnded(c.env, v, [task], 'removed');
	// Back where they were, unless that was the page of the copy that's now gone.
	const back = safeRedirect(str((await readForm(c)).back) || '/');
	const gone = new RegExp(`^/tasks/${task.id}(?![0-9])`).test(back) || back === '/';
	return c.redirect(withNotice(gone ? `/tasks/${others[0].id}?all=1` : back, 'ok', 'removed'));
});

// ---------- edit ----------

taskRoutes.get('/tasks/:id/edit', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task || !canManageTask(v, task)) return c.notFound();
	const [people, teamList, teamsOf, copies] = await Promise.all([
		activeMembers(c.env.DB),
		teams(c.env.DB),
		teamsByMember(c.env.DB),
		task.group_id ? all<{ assignee_id: number }>(c.env.DB, 'SELECT assignee_id FROM tasks WHERE group_id = ?', task.group_id) : Promise.resolve([{ assignee_id: task.assignee_id }])
	]);
	const teamChoices = teamsFor(v, teamList);
	if (task.team_id && !teamChoices.some((t) => t.id === task.team_id)) teamChoices.push(teamList.find((t) => t.id === task.team_id)!);
	const onTeam = (memberId: number, teamId: number) => teamsOf.get(memberId)?.includes(teamId) ?? false;
	return page(
		c,
		{ title: `Edit: ${task.title}`, active: 'tasks' },
		<>
			<PageHead eyebrow="Edit task" title={task.title} />
			<form method="post" action={`/tasks/${task.id}`} class="card form-grid">
				<Field label="Title" wide>
					<input name="title" required maxlength={200} value={task.title} />
				</Field>
				<Field label="Details" wide>
					<textarea name="details" rows={5}>
						{task.details}
					</textarea>
				</Field>
				<PeoplePicker
					label="Assigned to"
					hint="Everyone ticked is on this task. Tick someone to add them (they’re emailed); untick to take them off (their copy and its history are deleted)."
					teams={teamsFor(v, teamList).filter((t) => people.some((p) => onTeam(p.id, t.id)))}
					pickedTeams={new Set()}
					people={people}
					picked={new Set(copies.map((x) => x.assignee_id))}
					teamsOf={teamsOf}
					personName="assignee"
				/>
				<Field label="Due date" hint="Everyone already on the task is emailed the new date.">
					<input type="date" name="due_date" required value={task.due_date} />
				</Field>
				<Field label="Team">
					<TeamSelect name="team" teams={teamChoices.filter(Boolean)} selected={task.team_id} blank="No team" />
				</Field>
				{task.repeated ? (
					task.repeat_days > 0 && <p class="hint wide">{`This repeats ${repeatText(task, todayIn(c.env.TIMEZONE)).replace(/^E/, 'e')}. The next one is already made, so change the repeat there.`}</p>
				) : (
					<RepeatFields days={task.repeat_days} until={task.repeat_until} />
				)}
				<label class="check wide">
					<input type="checkbox" name="urgent" value="1" checked={!!task.urgent} />
					Urgent: extra reminders the evening it’s due, then every 2 hours while overdue
				</label>
				<div class="form-actions wide">
					<button class="btn primary">Save</button>
					<a class="btn ghost" href={`/tasks/${task.id}`}>
						Cancel
					</a>
					<span class="spacer"></span>
					{task.status === 'open' && (
						<button class="btn danger" formaction={`/tasks/${task.id}/status`} name="status" value="dropped" data-confirm="Drop this task for everyone? Reminders stop and it’s marked as not happening.">
							Drop task
						</button>
					)}
					<input type="hidden" name="all" value="1" />
				</div>
			</form>
		</>
	);
});

/** Saves a task for everyone on it: same title, details, due date, team and urgency; adds and removes people. */
taskRoutes.post('/tasks/:id', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, c.req.param('id'));
	if (!task || !canManageTask(v, task)) return c.notFound();
	const form = await readForm(c);
	const title = str(form.title, 200);
	const details = str(form.details, 10_000);
	const due = str(form.due_date);
	const teamId = id(form.team);
	const urgent = str(form.urgent) === '1' ? 1 : 0;
	// Once the next one's made, this one's repeat is history and stays as it was.
	const { repeatDays, repeatUntil } = task.repeated ? { repeatDays: task.repeat_days, repeatUntil: task.repeat_until } : readRepeat(form, due);
	const wanted = [...new Set(list(form.assignee).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
	const edit = `/tasks/${task.id}/edit`;
	if (!title || !wanted.length) return c.redirect(`${edit}?error=missing`);
	if (!isDate(due)) return c.redirect(`${edit}?error=date`);
	if (!isExec(v) && teamId !== task.team_id && !(teamId && v.leadOf.has(teamId))) return c.redirect(`${edit}?error=forbidden`);

	const db = c.env.DB;
	const copies = task.group_id ? await all<TaskRow>(db, `${TASK_SELECT} WHERE t.group_id = ? ORDER BY t.id`, task.group_id) : [{ ...task }];
	const staying = copies.filter((o) => wanted.includes(o.assignee_id));
	const leaving = copies.filter((o) => !wanted.includes(o.assignee_id));
	const adding = wanted.filter((a) => !copies.some((o) => o.assignee_id === a));

	// New people get their own copy, filed under the task's team.
	let newIds: number[] = [];
	if (adding.length) {
		const made = await createTasks(c.env, v, { title, details, assignees: adding, due, teamId, meetingId: task.meeting_id, urgent: !!urgent, repeatDays, repeatUntil });
		if ('error' in made) return c.redirect(`${edit}?error=${made.error}`);
		newIds = made.ids;
	}
	const groupId = task.group_id ?? (staying[0]?.id ?? newIds[0]);
	const stmts: D1PreparedStatement[] = [];
	if (copies.length + newIds.length - leaving.length > 1) {
		stmts.push(db.prepare('UPDATE tasks SET group_id = ? WHERE id IN (SELECT value FROM json_each(?))').bind(groupId, JSON.stringify([...staying.map((o) => o.id), ...newIds])));
	}
	const moved: number[] = [];
	const oldDue = new Map<number, string>();
	for (const o of staying) {
		const dueChanged = due !== o.due_date;
		if (dueChanged) {
			moved.push(o.id);
			oldDue.set(o.id, o.due_date);
		}
		stmts.push(
			db
				.prepare(
					`UPDATE tasks SET title = ?, details = ?, team_id = ?, due_date = ?, urgent = ?, repeat_days = ?, repeat_until = ?, updated_at = ?,
					 urgent_until = CASE WHEN ? THEN NULL ELSE urgent_until END,
					 escalated_on = CASE WHEN ? THEN NULL ELSE escalated_on END,
					 last_reminder_on = CASE WHEN ? THEN NULL ELSE last_reminder_on END WHERE id = ?`
				)
				.bind(title, details, teamId, due, urgent, repeatDays, repeatUntil, nowIso(), urgent && !o.urgent ? 1 : 0, dueChanged ? 1 : 0, dueChanged ? 1 : 0, o.id)
		);
		if (dueChanged) stmts.push(logTask(db, o.id, v.id, 'due_changed', `${formatDate(o.due_date)} → ${formatDate(due)}`));
		if (title !== o.title || details !== o.details || teamId !== o.team_id || urgent !== o.urgent || repeatDays !== o.repeat_days || repeatUntil !== o.repeat_until) stmts.push(logTask(db, o.id, v.id, 'edited'));
		for (const gone of leaving) stmts.push(logTask(db, o.id, v.id, 'unassigned', `${gone.assignee_name} is no longer on this task.`));
	}
	for (const gone of leaving) stmts.push(db.prepare('DELETE FROM tasks WHERE id = ?').bind(gone.id));
	await db.batch(stmts);
	await notifyAssigned(c.env, v, newIds);
	await notifyDueChanged(c.env, v, moved, oldDue);
	await notifyTaskEnded(c.env, v, leaving, 'removed');
	// Stay on this copy unless its person was taken off.
	const landing = staying.some((o) => o.id === task.id) ? task.id : (staying[0]?.id ?? newIds[0]);
	const shared = staying.length + newIds.length > 1;
	return c.redirect(`/tasks/${landing}?${shared && landing !== task.id ? 'all=1&' : ''}ok=saved`);
});
