import { Hono } from 'hono';
import { safeRedirect } from '../auth';
import { BOARD_STATUSES, boardLog, boardTask, boardTaskHref, type BoardTask } from '../board';
import { addDays, formatDate, formatTimestamp, isDate, todayIn } from '../dates';
import { all, first, run } from '../db';
import { id, list, readForm, str, withNotice, type FormData } from '../form';
import { isExec } from '../perm';
import { notifyBoardAssigned } from '../reminders';
import type { AppEnv, Team, Viewer } from '../types';
import { MoveCard } from '../views/board';
import { DoneMark } from '../views/task-stage';
import { page } from '../views/layout';
import { Empty, Field, Markdown, netIds, PageHead, PersonName, PostButton } from '../views/ui';
import { teamRoster, teamSubteams, type RosterMember, type Subteam } from './team-pages';

export const boardTaskRoutes = new Hono<AppEnv>();

/** Exec-team cards are for execs, like the rest of that team. */
const seen = (v: Viewer, task: BoardTask | null): task is BoardTask => !!task && (task.team_kind !== 'exec' || isExec(v));

function canAssignOnBoard(v: Viewer, team: number) {
	return isExec(v) || v.leadOf.has(team);
}

function fields(form: FormData) {
	return { title: str(form.title, 200), details: str(form.details, 10000), due: str(form.due) };
}

function assignmentIds(form: FormData, key: string, eligible: number[]) {
	const valid = new Set(eligible);
	const ids = [...new Set(list(form[key]).map(id))];
	return ids.every((value): value is number => value !== null && valid.has(value)) ? ids : null;
}

function insertAssignments(db: D1Database, task: string, team: number, people: number[], subteams: number[], changeToken: string) {
	return [
		db.prepare(`INSERT INTO board_task_people (task_id, team_id, member_id)
		 SELECT ?1, ?2, value FROM json_each(?3) WHERE EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?4)`)
			.bind(task, team, JSON.stringify(people), changeToken),
		db.prepare(`INSERT INTO board_task_subteams (task_id, team_id, subteam_id)
		 SELECT ?1, ?2, value FROM json_each(?3) WHERE EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?4)`)
			.bind(task, team, JSON.stringify(subteams), changeToken)
	];
}

export function TaskForm({ action, due, members, subteams, assignedPeople, assignedSubteams, task, returnToBoard, returnPath }: {
	action: string; due: string; members?: RosterMember[]; subteams?: Subteam[];
	assignedPeople: Set<number>; assignedSubteams: Set<number>; task?: BoardTask; returnToBoard?: boolean; returnPath?: string;
}) {
	return (
		<form class="card stack" method="post" action={action} data-board-assignment={members ? 'required' : undefined}>
			{task && <input type="hidden" name="version" value={task.version} />}
			{!task && <input type="hidden" name="status" value="open" />}
			{returnToBoard && <input type="hidden" name="return_to_board" value="1" />}
			{returnPath && <input type="hidden" name="return_path" value={returnPath} />}
			<Field label="Task"><input name="title" maxlength={200} required value={task?.title ?? ''} /></Field>
			<Field label="Details"><textarea name="details" rows={4} maxlength={10000}>{task?.details ?? ''}</textarea></Field>
			<Field label="Due date"><input type="date" name="due" required value={task?.due_date ?? due} /></Field>
			{members && <>
				<fieldset>
					<legend>Assign to people</legend>
					<div class="selection-grid" data-pick-people>{members.map((m) => <label class="check">
						<input type="checkbox" name="person" value={m.id} checked={assignedPeople.has(m.id)} /> <PersonName p={m} netId={netIds(members)} />
					</label>)}</div>
				</fieldset>
				{!!subteams?.length && <fieldset>
					<legend>Assign to subteams</legend>
					<div class="selection-grid">{subteams.map((s) => <label class="check">
						<input type="checkbox" name="subteam" value={s.id} checked={assignedSubteams.has(s.id)} /> {s.name}
					</label>)}</div>
				</fieldset>}
				<p class="hint">Assign at least one person or subteam. You can choose both.</p>
				<p class="hint" data-assignment-error hidden role="alert">Choose at least one person or subteam.</p>
			</>}
			<div><button class="btn primary">{task ? 'Save task' : 'Create task'}</button></div>
		</form>
	);
}

boardTaskRoutes.get('/teams/:id/board/new', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const team = await first<Team>(db, 'SELECT * FROM teams WHERE id = ? AND archived = 0', id(c.req.param('id')));
	if (!team || (!isExec(v) && !v.teamIds.has(team.id))) return c.notFound();
	const manager = canAssignOnBoard(v, team.id);
	const [roster, subteams] = manager
		? await Promise.all([teamRoster(db, team.id), teamSubteams(db, team.id)])
		: [undefined, undefined];
	const subteam = id(c.req.query('subteam'));
	return page(c, { title: 'New team task', active: 'teams' }, <>
		<PageHead title="New team task" sub={<a href={`/teams/${team.id}`}>{team.name}</a>} />
		<TaskForm action={`/teams/${team.id}/board`} due={addDays(todayIn(c.env.TIMEZONE), 7)} members={roster} subteams={subteams?.filter((s) => !s.archived)}
			assignedPeople={new Set(!subteam && v.teamIds.has(team.id) ? [v.id] : [])} assignedSubteams={new Set(subteam ? [subteam] : [])} />
	</>);
});

boardTaskRoutes.post('/teams/:id/board', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const team = id(c.req.param('id'));
	if (!team || (!isExec(v) && !v.teamIds.has(team)) || !await first(db, 'SELECT 1 FROM teams WHERE id = ? AND archived = 0', team)) return c.notFound();
	const form = await readForm(c);
	const path = `/teams/${team}/board/new`;
	const { title, details, due } = fields(form);
	const status = str(form.status) || 'open';
	if (!title || !isDate(due)) return c.redirect(`${path}?error=${title ? 'date' : 'missing'}`);
	if (!BOARD_STATUSES.some(([value]) => value === status)) return c.redirect(`${path}?error=selection`);
	const manager = canAssignOnBoard(v, team);
	const people = manager ? assignmentIds(form, 'person', (await teamRoster(db, team)).map((m) => m.id)) : [v.id];
	const subteams = manager ? assignmentIds(form, 'subteam', (await teamSubteams(db, team)).filter((s) => !s.archived).map((s) => s.id)) : [];
	if (!people || !subteams) return c.redirect(`${path}?error=selection`);
	if (!people.length && !subteams.length) return c.redirect(`${path}?error=assignment`);
	const task = crypto.randomUUID();
	await db.batch([
		db.prepare('INSERT INTO board_tasks (id, team_id, created_by, title, details, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(task, team, v.id, title, details, due, status),
		...insertAssignments(db, task, team, people, subteams, ''),
		boardLog(db, task, v.id, 'created')
	]);
	const made = await boardTask(db, v.id, task);
	if (made) await notifyBoardAssigned(c.env, v, made);
	const requestedReturn = safeRedirect(str(form.return_path));
	const boardReturn = new RegExp(`^/teams/${team}/subteams/[1-9]\\d*$`).test(requestedReturn) ? requestedReturn : `/teams/${team}`;
	return c.redirect(str(form.return_to_board) === '1' ? `${boardReturn}?ok=created#board-task-${task}` : `${boardTaskHref(task)}?ok=created`);
});

boardTaskRoutes.get('/board-tasks/:id', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const task = await boardTask(db, v.id, c.req.param('id'));
	if (!seen(v, task)) return c.notFound();
	const href = boardTaskHref(task.id);
	const today = todayIn(c.env.TIMEZONE);
	const manager = canAssignOnBoard(v, task.team_id);
	const [activity, members, subteams, people, groups] = await Promise.all([
		all<{ name: string; kind: string; body: string; created_at: string }>(db, `SELECT m.name, a.kind, a.body, a.created_at
		 FROM board_task_activity a JOIN members m ON m.id = a.member_id WHERE a.task_id = ? ORDER BY a.id`, task.id),
		manager ? teamRoster(db, task.team_id) : undefined,
		manager ? teamSubteams(db, task.team_id) : undefined,
		manager ? all<{ member_id: number }>(db, 'SELECT member_id FROM board_task_people WHERE task_id = ?', task.id) : [],
		manager ? all<{ subteam_id: number }>(db, 'SELECT subteam_id FROM board_task_subteams WHERE task_id = ?', task.id) : []
	]);
	return page(c, { title: task.title, active: 'tasks' }, <>
		<PageHead title={task.title} sub={<a href={`/teams/${task.team_id}`}>{task.team_name}</a>} />
		<div class="grid-2 wide-left">
			<section class="stack">
				<dl class="facts card">
					<div><dt>Status</dt><dd><span class="task-title-line">{task.status === 'done' ? ((isExec(v) || !!task.is_mine) ? <MoveCard action={`${href}/move`} status="done" title={task.title} back={href} version={task.version} /> : <DoneMark />) : BOARD_STATUSES.find(([status]) => status === task.status)?.[1]}</span></dd></div>
					<div><dt>Due</dt><dd>{formatDate(task.due_date, today)}</dd></div>
					<div><dt>Assigned to</dt><dd>{[task.people, task.subteams].filter(Boolean).join(' · ') || 'Unassigned'}</dd></div>
				</dl>
				{task.status !== 'done' && (isExec(v) || !!task.is_mine) && <MoveCard action={`${href}/move`} status={task.status} title={task.title} back={href} version={task.version} />}
				{!task.is_assigned && v.teamIds.has(task.team_id) && ['open', 'in_progress'].includes(task.status) &&
					<PostButton action={`${href}/claim`} label="Assign to me" back={href} />}
				<Markdown text={task.details} empty="No details." />
				{(manager || task.created_by === v.id) && <details>
					<summary class="link-btn">Edit task</summary>
					<TaskForm action={`${href}/edit`} due={task.due_date} task={task} members={members} subteams={subteams?.filter((s) => !s.archived)}
						assignedPeople={new Set(people.map((p) => p.member_id))} assignedSubteams={new Set(groups.map((g) => g.subteam_id))} />
				</details>}
			</section>
			<section class="stack">
				<h2 class="section-title">Activity</h2>
				{activity.length ? <ol class="timeline">{activity.map((a) => <li class="ev">
					<div class="ev-head"><b>{a.name}</b> {a.kind}<time>{formatTimestamp(a.created_at, c.env.TIMEZONE)}</time></div>
					{a.kind === 'comment' ? <Markdown text={a.body} /> : a.body && <p>{a.body}</p>}
				</li>)}</ol> : <Empty>No activity yet.</Empty>}
				<form class="stack" method="post" action={`${href}/comment`}>
					<Field label="Add a comment"><textarea name="body" rows={3} maxlength={5000} required></textarea></Field>
					<div><button class="btn">Comment</button></div>
				</form>
			</section>
		</div>
	</>);
});

boardTaskRoutes.post('/board-tasks/:id/edit', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const task = await boardTask(db, v.id, c.req.param('id'));
	if (!seen(v, task)) return c.notFound();
	const manager = canAssignOnBoard(v, task.team_id);
	if (!manager && task.created_by !== v.id) return c.notFound();
	const form = await readForm(c);
	const { title, details, due } = fields(form);
	const href = boardTaskHref(task.id);
	if (!title || !isDate(due)) return c.redirect(`${href}?error=${title ? 'date' : 'missing'}`);
	const change = crypto.randomUUID();
	const version = id(form.version);
	const writes = [db.prepare('UPDATE board_tasks SET title = ?, details = ?, due_date = ?, version = version + 1, change_token = ? WHERE id = ? AND version = ?')
		.bind(title, details, due, change, task.id, version)];
	if (manager) {
		const [roster, subteams] = await Promise.all([teamRoster(db, task.team_id), teamSubteams(db, task.team_id)]);
		const people = assignmentIds(form, 'person', roster.map((m) => m.id));
		const groups = assignmentIds(form, 'subteam', subteams.filter((s) => !s.archived).map((s) => s.id));
		if (!people || !groups) return c.redirect(`${href}?error=selection`);
		if (!people.length && !groups.length) return c.redirect(`${href}?error=assignment`);
		writes.push(
			db.prepare(`DELETE FROM board_task_people WHERE task_id = ?1 AND member_id IN (SELECT id FROM members WHERE active = 1)
			 AND EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?2)`).bind(task.id, change),
			db.prepare(`DELETE FROM board_task_subteams WHERE task_id = ?1 AND subteam_id IN (SELECT id FROM subteams WHERE archived = 0)
			 AND EXISTS (SELECT 1 FROM board_tasks WHERE id = ?1 AND change_token = ?2)`).bind(task.id, change),
			...insertAssignments(db, task.id, task.team_id, people, groups, change)
		);
	}
	writes.push(db.prepare(`INSERT INTO board_task_activity (task_id, member_id, kind, body)
	 SELECT id, ?, 'edited', '' FROM board_tasks WHERE id = ? AND change_token = ?`).bind(v.id, task.id, change));
	const before = new Set((await all<{ member_id: number }>(db, 'SELECT member_id FROM board_task_recipients WHERE task_id = ?', task.id)).map((r) => r.member_id));
	const [result] = await db.batch(writes);
	if (result.meta.changes && manager) await notifyBoardAssigned(c.env, v, { ...task, title, due_date: due }, before);
	return c.redirect(`${href}?${result.meta.changes ? 'ok=saved' : 'error=stale'}`);
});

boardTaskRoutes.post('/board-tasks/:id/move', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const task = await boardTask(db, v.id, c.req.param('id'));
	if (!seen(v, task) || (!isExec(v) && !task.is_mine)) return c.notFound();
	const form = await readForm(c);
	const next = BOARD_STATUSES.find(([key]) => key === str(form.status));
	const back = safeRedirect(str(form.back) || boardTaskHref(task.id));
	if (!next) return c.redirect(withNotice(back, 'error', 'missing'));
	if (next[0] === task.status && id(form.version) === task.version) return c.redirect(back);
	const [result] = await db.batch([
		db.prepare(`UPDATE board_tasks SET status = ?1, version = version + 1 WHERE id = ?2 AND version = ?3
		 AND (?4 = 1 OR EXISTS (SELECT 1 FROM board_task_recipients WHERE task_id = ?2 AND member_id = ?5))`)
			.bind(next[0], task.id, id(form.version), isExec(v) ? 1 : 0, v.id),
		boardLog(db, task.id, v.id, 'moved', next[1], true)
	]);
	return c.redirect(withNotice(back, result.meta.changes ? 'ok' : 'error', result.meta.changes ? 'saved' : 'stale'));
});

boardTaskRoutes.post('/board-tasks/:id/claim', async (c) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const task = await boardTask(db, v.id, c.req.param('id'));
	if (!seen(v, task) || !v.teamIds.has(task.team_id)) return c.notFound();
	const form = await readForm(c);
	const back = safeRedirect(str(form.back) || boardTaskHref(task.id));
	const [result] = await db.batch([
		db.prepare(`INSERT INTO board_task_people (task_id, team_id, member_id)
		 SELECT b.id, b.team_id, ?2 FROM board_tasks b WHERE b.id = ?1 AND b.status IN ('open', 'in_progress')
		  AND EXISTS (SELECT 1 FROM team_members WHERE team_id = b.team_id AND member_id = ?2)
		  AND NOT EXISTS (SELECT 1 FROM board_task_people x JOIN members m ON m.id = x.member_id WHERE x.task_id = b.id AND m.active = 1)
		  AND NOT EXISTS (SELECT 1 FROM board_task_subteams x JOIN subteams s ON s.id = x.subteam_id WHERE x.task_id = b.id AND s.archived = 0)
		 ON CONFLICT(task_id, member_id) DO NOTHING`).bind(task.id, v.id),
		boardLog(db, task.id, v.id, 'claimed', '', true),
		db.prepare('UPDATE board_tasks SET version = version + 1 WHERE id = ? AND changes() > 0').bind(task.id)
	]);
	return c.redirect(withNotice(back, result.meta.changes ? 'ok' : 'error', result.meta.changes ? 'assigned-self' : 'stale'));
});

boardTaskRoutes.post('/board-tasks/:id/comment', async (c) => {
	const v = c.get('viewer');
	const task = await boardTask(c.env.DB, v.id, c.req.param('id'));
	if (!seen(v, task)) return c.notFound();
	const text = str((await readForm(c)).body);
	if (text) await boardLog(c.env.DB, task.id, v.id, 'comment', text).run();
	return c.redirect(`${boardTaskHref(task.id)}?${text ? 'ok=commented' : 'error=missing'}`);
});
