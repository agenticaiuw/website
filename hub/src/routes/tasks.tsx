import { Hono } from 'hono';
import { safeRedirect } from '../auth';
import { addDays, formatDate, formatTimestamp, isDate, todayIn } from '../dates';
import { activeMembers, all, first, groupStats, logTask, memberById, nowIso, run, setTaskStatus, TASK_SELECT, TASK_VISIBLE, taskById, teams, visible } from '../db';
import { id, list, readForm, str, withNotice } from '../form';
import { canAssign, canCompleteTask, canManageTask, canSeeTask, isExec, teamsFor } from '../perm';
import { notifyAssigned } from '../reminders';
import type { AppEnv, Member, Task, TaskRow, TaskStatus, Team, Viewer } from '../types';
import { page } from '../views/layout';
import { Due, Field, Markdown, MemberSelect, PageHead, PostButton, Tabs, TaskList, TeamSelect } from '../views/ui';

export const taskRoutes = new Hono<AppEnv>();

// ---------- list ----------

taskRoutes.get('/tasks', async (c) => {
	const v = c.get('viewer');
	const today = todayIn(c.env.TIMEZONE);
	const status = c.req.query('status') ?? 'open';
	const assignee = id(c.req.query('assignee'));
	const team = id(c.req.query('team'));
	const q = (c.req.query('q') ?? '').trim().slice(0, 100);

	const where = [visible(v, TASK_VISIBLE)];
	const params: (string | number)[] = [v.id];
	const bind = (value: string | number) => `?${params.push(value)}`;
	if (status === 'open') where.push("t.status = 'open'");
	else if (status === 'overdue') where.push(`t.status = 'open' AND t.due_date < ${bind(today)}`);
	else if (status === 'done') where.push("t.status = 'done'");
	else if (status === 'dropped') where.push("t.status = 'dropped'");
	if (assignee) where.push(`t.assignee_id = ${bind(assignee)}`);
	if (team) where.push(`t.team_id = ${bind(team)}`);
	if (q) where.push(`(t.title LIKE ${bind(`%${q}%`)} OR t.details LIKE ?${params.length})`);
	const order = status === 'done' || status === 'dropped' ? 't.completed_at DESC, t.updated_at DESC' : 't.due_date, t.id';

	const [tasks, people, teamList] = await Promise.all([
		all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 300`, ...params),
		activeMembers(c.env.DB),
		teams(c.env.DB)
	]);
	const groups = await groupStats(c.env.DB, tasks);
	const visibleTeams = isExec(v) ? teamList : teamList.filter((t) => t.kind === 'project' || v.teamIds.has(t.id));
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
				sub={isExec(v) ? 'Every task in the club.' : 'Your tasks, tasks you assigned, and your project teams’ tasks.'}
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
				<TeamSelect name="team" teams={visibleTeams} selected={team} blank="Any team" label="Team" />
				<input type="search" name="q" value={q} placeholder="Search tasks" aria-label="Search tasks" />
				<button class="btn js-hide">Filter</button>
			</form>
			<TaskList tasks={tasks} today={today} viewer={v} show={['assignee', 'team', 'meeting']} back={back} empty="No tasks match." groups={groups} />
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
	const [people, teamList, memberships] = await Promise.all([
		activeMembers(c.env.DB),
		teams(c.env.DB),
		all<{ team_id: number; member_id: number }>(c.env.DB, 'SELECT x.team_id, x.member_id FROM team_members x JOIN teams t ON t.id = x.team_id WHERE t.archived = 0')
	]);
	const teamsOf = new Map<number, number[]>();
	for (const r of memberships) teamsOf.set(r.member_id, [...(teamsOf.get(r.member_id) ?? []), r.team_id]);
	const pickTeams = teamsFor(v, teamList).filter((t) => memberships.some((r) => r.team_id === t.id));
	const preTeam = id(c.req.query('team'));
	const preAssignee = id(c.req.query('assignee'));
	return page(
		c,
		{ title: 'New task', active: 'tasks' },
		<>
			<PageHead eyebrow="Tasks" title="New task" sub={canAssign(v) ? 'Give it to one person or a whole team. Each person is emailed and reminded until they’re done, and you see everyone’s progress on one task.' : 'Track something you committed to. You’ll get reminders before it’s due.'} />
			<form method="post" action="/tasks" class="card form-grid">
				<Field label="What needs to happen" wide>
					<input name="title" required maxlength={200} placeholder="e.g. Order the nRF52 dev boards" />
				</Field>
				<Field label="Details" hint="Optional. Links, context, what “done” looks like." wide>
					<textarea name="details" rows={4}></textarea>
				</Field>
				{canAssign(v) ? (
					<div class="field wide">
						<span class="label">Assign to</span>
						<div class="picker">
							<div class="picker-teams js-only">
								{pickTeams.map((t) => (
									<button type="button" class="chip" data-pick-team={String(t.id)} aria-pressed="false">
										{t.name}
									</button>
								))}
								<span class="picker-count">
									<span data-picker-count></span> ·{' '}
									<button type="button" class="link-btn" data-picker-clear>
										Clear
									</button>
								</span>
							</div>
							<input type="search" placeholder="Find a person" aria-label="Find a person" data-picker-filter class="js-only" />
							<div class="picker-list">
								{people.map((m) => (
									<label data-teams={(teamsOf.get(m.id) ?? []).join(' ')}>
										<input type="checkbox" name="assignee" value={String(m.id)} checked={preAssignee ? m.id === preAssignee : m.id === v.id} />
										{m.name}
									</label>
								))}
							</div>
						</div>
					</div>
				) : (
					<input type="hidden" name="assignee" value={String(v.id)} />
				)}
				<Field label="Due date">
					<input type="date" name="due_date" required value={addDays(today, 7)} min={addDays(today, -365)} />
				</Field>
				<Field label="Team" hint={isExec(v) ? undefined : 'Tasks for other people must belong to a team you lead.'}>
					<TeamSelect name="team" teams={assignableTeams(v, teamList)} selected={preTeam} blank="No team" />
				</Field>
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
	input: { title: string; details: string; assignees: number[]; due: string; teamId: number | null; meetingId: number | null; urgent?: boolean }
): Promise<{ ids: number[] } | { error: string }> {
	if (!input.title || !input.assignees.length) return { error: 'missing' };
	if (!isDate(input.due)) return { error: 'date' };
	const others = input.assignees.some((a) => a !== v.id);
	if (!isExec(v)) {
		if (others && !(input.teamId && v.leadOf.has(input.teamId))) return { error: 'forbidden' };
		if (!others && input.teamId && !v.teamIds.has(input.teamId)) return { error: 'forbidden' };
	}
	const ids: number[] = [];
	for (const assignee of [...new Set(input.assignees)]) {
		const person = await memberById(env.DB, assignee);
		if (!person || !person.active) continue;
		const res = await run(
			env.DB,
			'INSERT INTO tasks (title, details, assignee_id, assigned_by, team_id, meeting_id, due_date, urgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
			input.title,
			input.details,
			assignee,
			v.id,
			input.teamId,
			input.meetingId,
			input.due,
			input.urgent ? 1 : 0
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
	const result = await createTasks(c.env, v, {
		title: str(form.title, 200),
		details: str(form.details, 10_000),
		assignees: canAssign(v) ? assignees : [v.id],
		due: str(form.due_date),
		teamId: id(form.team),
		meetingId: null,
		urgent: str(form.urgent) === '1'
	});
	if ('error' in result) return c.redirect(`/tasks/new?error=${result.error}`);
	await notifyAssigned(c.env, v, result.ids);
	if (result.ids.length === 1) return c.redirect(`/tasks/${result.ids[0]}?ok=created`);
	// Several people: your own copy if you're one of them, otherwise the overview of everyone.
	const own = await first<{ id: number }>(c.env.DB, 'SELECT id FROM tasks WHERE id IN (SELECT value FROM json_each(?)) AND assignee_id = ?', JSON.stringify(result.ids), v.id);
	return c.redirect(own ? `/tasks/${own.id}?ok=assigned` : `/tasks/${result.ids[0]}?all=1&ok=assigned`);
});

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
	reassigned: 'reassigned it'
};

async function loadTask(c: { env: AppEnv['Bindings'] }, v: Viewer, raw: string) {
	const taskId = id(raw);
	const task = taskId ? await taskById(c.env.DB, taskId) : null;
	return task && canSeeTask(v, task) ? task : null;
}

taskRoutes.get('/tasks/:id', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, v, c.req.param('id'));
	if (!task) return c.notFound();
	const today = todayIn(c.env.TIMEZONE);
	const [activity, copies] = await Promise.all([
		all<Activity>(
			c.env.DB,
			`SELECT a.id, a.kind, a.body, a.created_at, m.name AS member_name
			 FROM task_activity a LEFT JOIN members m ON m.id = a.member_id
			 WHERE a.task_id = ? ORDER BY a.created_at, a.id`,
			task.id
		),
		task.group_id ? all<TaskRow>(c.env.DB, `${TASK_SELECT} WHERE t.group_id = ? ORDER BY a.name COLLATE NOCASE`, task.group_id) : Promise.resolve([])
	]);
	const back = `/tasks/${task.id}`;
	// A shared task: everyone's copy, each with its own tick. With ?all=1 the page is an overview
	// for someone who isn't on it; otherwise it's about this one person's copy.
	const everyone = copies.filter((t) => canSeeTask(v, t));
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
			<TaskList tasks={everyone} today={today} viewer={v} show={[]} by="assignee" back={overview ? `${back}?all=1` : `${back}#everyone`} />
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
						{!overview && task.status === 'open' && canCompleteTask(v, task) && <PostButton action={`/tasks/${task.id}/status`} name="status" value="done" label="Mark done" cls="btn primary" back={back} />}
						{!overview && task.status !== 'open' && canCompleteTask(v, task) && <PostButton action={`/tasks/${task.id}/status`} name="status" value="open" label="Reopen" back={back} />}
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
							<dd>{overview ? `${done} of ${total} done` : <Due task={task} today={today} />}</dd>
						</div>
						<div>
							<dt>Due</dt>
							<dd>{formatDate(task.due_date, today)}</dd>
						</div>
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
						{task.meeting_id && (
							<div>
								<dt>From meeting</dt>
								<dd>
									<a href={`/meetings/${task.meeting_id}`}>{task.meeting_title}</a>
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
						<form method="post" action={`/tasks/${task.id}/comment`} class="stack">
							<label class="field">
								<span class="label">Add a comment</span>
								<textarea name="body" rows={3} required placeholder="Progress, blockers, a link to the result…"></textarea>
							</label>
							<div>
								<button class="btn">Comment</button>
							</div>
						</form>
					</section>
				)}
			</div>
		</>
	);
});

taskRoutes.post('/tasks/:id/status', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, v, c.req.param('id'));
	if (!task) return c.notFound();
	const form = await readForm(c);
	const status = str(form.status) as TaskStatus;
	const allowed = status === 'dropped' ? canManageTask(v, task) : (status === 'done' || status === 'open') && canCompleteTask(v, task);
	const back = safeRedirect(str(form.back) || `/tasks/${task.id}`);
	if (!allowed) return c.redirect(withNotice(back, 'error', 'forbidden'));
	if (status === 'dropped' && str(form.all) === '1' && task.group_id) {
		const open = await all<{ id: number }>(c.env.DB, "SELECT id FROM tasks WHERE group_id = ? AND status = 'open'", task.group_id);
		for (const t of open) await setTaskStatus(c.env.DB, t.id, 'dropped', v.id);
	} else if (task.status !== status) await setTaskStatus(c.env.DB, task.id, status, v.id);
	return c.redirect(withNotice(back, 'ok', { done: 'done', open: 'reopened', dropped: 'dropped' }[status]));
});

taskRoutes.post('/tasks/:id/comment', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, v, c.req.param('id'));
	if (!task) return c.notFound();
	const body = str((await readForm(c)).body, 5000);
	if (body) await logTask(c.env.DB, task.id, v.id, 'comment', body).run();
	return c.redirect(`/tasks/${task.id}?ok=commented`);
});

// ---------- edit ----------

taskRoutes.get('/tasks/:id/edit', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, v, c.req.param('id'));
	if (!task || !canManageTask(v, task)) return c.notFound();
	const [people, teamList, group] = await Promise.all([
		activeMembers(c.env.DB),
		teams(c.env.DB),
		task.group_id ? first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM tasks WHERE group_id = ?', task.group_id) : Promise.resolve(null)
	]);
	const copies = group?.n ?? 1;
	const teamChoices = teamsFor(v, teamList);
	if (task.team_id && !teamChoices.some((t) => t.id === task.team_id)) teamChoices.push(teamList.find((t) => t.id === task.team_id)!);
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
				<Field label={copies > 1 ? 'This copy is for' : 'Assigned to'} hint="Reassigning emails the new person.">
					<MemberSelect name="assignee" members={people} selected={task.assignee_id} required />
				</Field>
				<Field label="Due date" hint="Changes are recorded in the task’s history.">
					<input type="date" name="due_date" required value={task.due_date} />
				</Field>
				<Field label="Team">
					<TeamSelect name="team" teams={teamChoices.filter(Boolean)} selected={task.team_id} blank="No team" />
				</Field>
				<label class="check wide">
					<input type="checkbox" name="urgent" value="1" checked={!!task.urgent} />
					Urgent: extra reminders the evening it’s due, then every 2 hours while overdue
				</label>
				{copies > 1 && (
					<label class="check wide">
						<input type="checkbox" name="all" value="1" checked />
						Apply to all {copies} people’s copies: title, details, due date, team, urgent, and Drop
					</label>
				)}
				<div class="form-actions wide">
					<button class="btn primary">Save</button>
					<a class="btn ghost" href={`/tasks/${task.id}`}>
						Cancel
					</a>
					<span class="spacer"></span>
					{task.status === 'open' && (
						<button class="btn danger" formaction={`/tasks/${task.id}/status`} name="status" value="dropped" data-confirm="Drop this task? Reminders stop and it’s marked as not happening.">
							Drop task
						</button>
					)}
				</div>
			</form>
		</>
	);
});

taskRoutes.post('/tasks/:id', async (c) => {
	const v = c.get('viewer');
	const task = await loadTask(c, v, c.req.param('id'));
	if (!task || !canManageTask(v, task)) return c.notFound();
	const form = await readForm(c);
	const title = str(form.title, 200);
	const details = str(form.details, 10_000);
	const due = str(form.due_date);
	const assignee = id(form.assignee);
	const teamId = id(form.team);
	const urgent = str(form.urgent) === '1' ? 1 : 0;
	if (!title || !assignee) return c.redirect(`/tasks/${task.id}/edit?error=missing`);
	if (!isDate(due)) return c.redirect(`/tasks/${task.id}/edit?error=date`);
	if (!isExec(v) && teamId !== task.team_id && !(teamId && v.leadOf.has(teamId))) return c.redirect(`/tasks/${task.id}/edit?error=forbidden`);
	const newPerson: Member | null = assignee !== task.assignee_id ? await memberById(c.env.DB, assignee) : null;
	if (assignee !== task.assignee_id && !newPerson?.active) return c.redirect(`/tasks/${task.id}/edit?error=missing`);

	const db = c.env.DB;
	const stmts: D1PreparedStatement[] = [];
	const dueChanged = due !== task.due_date;
	stmts.push(
		db
			.prepare(
				`UPDATE tasks SET title = ?, details = ?, assignee_id = ?, team_id = ?, due_date = ?, urgent = ?, updated_at = ?,
				 urgent_until = CASE WHEN ? THEN NULL ELSE urgent_until END,
				 escalated_on = CASE WHEN ? THEN NULL ELSE escalated_on END,
				 last_reminder_on = CASE WHEN ? THEN NULL ELSE last_reminder_on END
				 WHERE id = ?`
			)
			.bind(title, details, assignee, teamId, due, urgent, nowIso(), urgent && !task.urgent ? 1 : 0, dueChanged || !!newPerson ? 1 : 0, newPerson ? 1 : 0, task.id)
	);
	if (dueChanged) stmts.push(logTask(db, task.id, v.id, 'due_changed', `${formatDate(task.due_date)} → ${formatDate(due)}`));
	if (newPerson) stmts.push(logTask(db, task.id, v.id, 'reassigned', `${task.assignee_name} → ${newPerson.name}`));
	if (title !== task.title || details !== task.details || teamId !== task.team_id || urgent !== task.urgent) stmts.push(logTask(db, task.id, v.id, 'edited'));
	if (str(form.all) === '1' && task.group_id) {
		const others = await all<Task>(db, 'SELECT * FROM tasks WHERE group_id = ? AND id != ?', task.group_id, task.id);
		for (const o of others) {
			const moved = due !== o.due_date;
			stmts.push(
				db
					.prepare(
						`UPDATE tasks SET title = ?, details = ?, team_id = ?, due_date = ?, urgent = ?, updated_at = ?,
						 urgent_until = CASE WHEN ? THEN NULL ELSE urgent_until END,
						 escalated_on = CASE WHEN ? THEN NULL ELSE escalated_on END WHERE id = ?`
					)
					.bind(title, details, teamId, due, urgent, nowIso(), urgent && !o.urgent ? 1 : 0, moved ? 1 : 0, o.id)
			);
			if (moved) stmts.push(logTask(db, o.id, v.id, 'due_changed', `${formatDate(o.due_date)} → ${formatDate(due)}`));
			if (title !== o.title || details !== o.details || teamId !== o.team_id || urgent !== o.urgent) stmts.push(logTask(db, o.id, v.id, 'edited'));
		}
	}
	await db.batch(stmts);
	if (newPerson) await notifyAssigned(c.env, v, [task.id]);
	return c.redirect(`/tasks/${task.id}?ok=saved`);
});
