import { Hono } from 'hono';
import { boardTasks } from '../board';
import { addDays, formatDate, todayIn } from '../dates';
import { activeMembers, all, groupStats, MEETING_SELECT, memberByEmail, memberById, MEETING_VISIBLE, run, TASK_ON_TEAM, TASK_SELECT, TASK_VISIBLE, teams, visible } from '../db';
import { id, isEmail, readForm, str } from '../form';
import { canManageRoles, isExec, isOwner } from '../perm';
import { notifyTeamAdded } from '../reminders';
import type { AppEnv, AttendanceStatus, Member, MeetingRow, Role, Team, TaskRow } from '../types';
import { page } from '../views/layout';
import { BoardTaskList } from '../views/board';
import { Choice, Empty, Field, MemberSelect, MembersDialog, Menu, PageHead, pct, PostButton, Stat, TaskList, TeamSelect } from '../views/ui';

export const peopleRoutes = new Hono<AppEnv>();

const forbidden = (c: { redirect: (url: string) => Response }) => c.redirect('/?error=forbidden');

type BoardRow = Member & {
	open: number;
	overdue: number;
	done: number;
	on_time: number;
	marked: number;
	attended: number;
	excused: number;
	team_names: string | null;
};

const BOARD_SQL = `
	SELECT m.*,
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'open') AS open,
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'open' AND t.due_date < ?1) AS overdue,
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'done') AS done,
		-- Done by the end of the due day in Chicago (midnight there is 05:00–06:00 UTC).
		(SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status = 'done'
			AND t.completed_at < strftime('%Y-%m-%dT%H:%M:%fZ', t.due_date, '+1 day', '+6 hours')) AS on_time,
		-- Attendance counts team meetings only; club events are optional.
		(SELECT COUNT(*) FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id WHERE a.member_id = m.id AND mt.kind = 'meeting') AS marked,
		(SELECT COUNT(*) FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id WHERE a.member_id = m.id AND mt.kind = 'meeting' AND a.status IN ('present', 'late')) AS attended,
		(SELECT COUNT(*) FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id WHERE a.member_id = m.id AND mt.kind = 'meeting' AND a.status = 'excused') AS excused,
		(SELECT group_concat(tm.name, ', ') FROM team_members x JOIN teams tm ON tm.id = x.team_id
			WHERE x.member_id = m.id AND tm.archived = 0) AS team_names
	FROM members m`;

/** Attendance rate leaves excused absences out of the count. */
const attendanceRate = (r: Pick<BoardRow, 'attended' | 'marked' | 'excused'>) => pct(r.attended, r.marked - r.excused);

peopleRoutes.get('/people', async (c) => {
	const v = c.get('viewer');
	const today = todayIn(c.env.TIMEZONE);
	const showInactive = c.req.query('inactive') === '1';
	const [rows, teamList] = await Promise.all([
		all<BoardRow>(
			c.env.DB,
			`${BOARD_SQL} ${showInactive ? '' : 'WHERE m.active = 1'} ORDER BY ${isExec(v) ? 'overdue DESC, open DESC, ' : ''}m.name COLLATE NOCASE`,
			today
		),
		isExec(v) ? teams(c.env.DB) : Promise.resolve([])
	]);

	if (!isExec(v)) {
		return page(
			c,
			{ title: 'People', active: 'people' },
			<>
				<PageHead title="People" sub="Everyone on the club roster." />
				<ul class="roster">
					{rows.map((r) => (
						<li>
							<a href={`/people/${r.id}`}>{r.name}</a>
							<span class="muted">{[r.title, r.role === 'exec' && 'Exec', r.major, r.team_names].filter(Boolean).join(' · ')}</span>
						</li>
					))}
				</ul>
			</>
		);
	}

	const totals = rows.reduce((s, r) => ({ open: s.open + r.open, overdue: s.overdue + r.overdue, people: s.people + (r.overdue ? 1 : 0) }), { open: 0, overdue: 0, people: 0 });
	return page(
		c,
		{ title: 'People', active: 'people' },
		<>
			<PageHead
				title="People"
				sub="Who has what, what's late, and who shows up. Sorted by overdue work."
				actions={
					<button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="add-people-dialog" data-members-dialog="add-people-dialog">
						Add people
					</button>
				}
			/>
			<dialog id="add-people-dialog" class="members-dialog" aria-labelledby="add-people-title">
				<div class="members-dialog-content stack">
					<header>
						<h2 id="add-people-title">Add people</h2>
						<form method="dialog">
							<button class="btn small">Close</button>
						</form>
					</header>
					<NewPersonForm action="/people/add" teams={teamList} />
					<details class="disclose">
						<summary>Add many at once</summary>
						<form method="post" action="/people/import" class="stack">
							<p class="hint">
								One per line: <code>Name, email</code>, with <code>, exec</code> on the end for execs. Anyone already on the roster is updated, not duplicated. Put people on teams from the Teams page.
							</p>
							<textarea name="lines" rows={6} placeholder={'Bucky Badger, bucky@wisc.edu\nAva Chen, achen@wisc.edu, exec'} required></textarea>
							<div>
								<button class="btn primary">Add</button>
							</div>
						</form>
					</details>
				</div>
			</dialog>
			<div class="stats">
				<Stat value={rows.length} label="People" />
				<Stat value={totals.open} label="Open tasks" />
				<Stat value={totals.overdue} label="Overdue tasks" tone={totals.overdue ? 'bad' : undefined} />
				<Stat value={totals.people} label="People with overdue work" tone={totals.people ? 'bad' : undefined} />
			</div>
			<div class="table-wrap">
				<table class="table board">
					<thead>
						<tr>
							<th>Name</th>
							<th>Teams</th>
							<th class="num">Open</th>
							<th class="num">Overdue</th>
							<th class="num">Done</th>
							<th class="num" title="Share of finished tasks done by their due date">On time</th>
							<th class="num" title="Meetings attended, not counting excused absences">Attendance</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr class={r.active ? '' : 'inactive'}>
								<td>
									<a href={`/people/${r.id}`}>{r.name}</a>
									{r.is_owner ? <span class="tag exec">Owner</span> : r.role === 'exec' && <span class="tag exec">Exec</span>}
									{r.title && <span class="tag">{r.title}</span>}
									{!r.active && <span class="tag">Inactive</span>}
									<div class="muted small">{r.email}</div>
									{r.major && <div class="muted small">{r.major}</div>}
								</td>
								<td class="small">{r.team_names ?? <span class="muted">—</span>}</td>
								<td class="num">
									<a href={`/tasks?assignee=${r.id}`}>{r.open}</a>
								</td>
								<td class={`num${r.overdue ? ' bad' : ''}`}>
									<a href={`/tasks?status=overdue&assignee=${r.id}`}>{r.overdue}</a>
								</td>
								<td class="num">{r.done}</td>
								<td class="num">{pct(r.on_time, r.done)}</td>
								<td class="num">
									{attendanceRate(r)}
									{r.marked > 0 && <div class="muted small">{r.attended}/{r.marked - r.excused}</div>}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p class="hint">
				<a href={showInactive ? '/people' : '/people?inactive=1'}>{showInactive ? 'Hide' : 'Show'} inactive people</a>
			</p>

		</>
	);
});

peopleRoutes.post('/people/import', async (c) => {
	const v = c.get('viewer');
	if (!isExec(v)) return forbidden(c);
	// Only the owner can make someone an exec, and the import never touches the owner's row.
	const rolesOk = await canManageRoles(c.env.DB, v);
	const lines = str((await readForm(c)).lines, 50_000).split(/\r?\n/);
	const stmts: D1PreparedStatement[] = [];
	for (const line of lines) {
		const [name, email, role] = line.split(/[,\t]/).map((s) => s.trim());
		if (!name || !email || !isEmail(email)) continue;
		const isExecRow = rolesOk && /^exec/i.test(role ?? '');
		stmts.push(
			c.env.DB.prepare(
				`INSERT INTO members (name, email, role) VALUES (?, ?, ?)
				 ON CONFLICT(email) DO UPDATE SET name = excluded.name, active = 1${isExecRow ? ", role = 'exec'" : ''}
				 WHERE members.is_owner = 0`
			).bind(name.slice(0, 100), email.toLowerCase().slice(0, 200), isExecRow ? 'exec' : 'member')
		);
	}
	if (stmts.length) await c.env.DB.batch(stmts);
	return c.redirect(stmts.length ? '/people?ok=imported' : '/people?error=missing');
});

/** Puts someone on the roster by email (bringing them back if they'd left) and returns their id. Never renames anyone already on it. */
async function addPerson(db: D1Database, name: string, email: string) {
	const clean = email.trim().toLowerCase();
	if (!name.trim() || !isEmail(clean)) return null;
	await run(
		db,
		"INSERT INTO members (name, email, role) VALUES (?, ?, 'member') ON CONFLICT(email) DO UPDATE SET active = 1 WHERE members.is_owner = 0",
		name.trim().slice(0, 100),
		clean.slice(0, 200)
	);
	return (await memberByEmail(db, clean))?.id ?? null;
}

/** Puts someone on a team (or sets whether they lead it). True when they weren't on it before. */
async function addToTeam(db: D1Database, teamId: number, memberId: number, lead = false) {
	const was = await all(db, 'SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?', teamId, memberId);
	await run(db, 'INSERT INTO team_members (team_id, member_id, is_lead) VALUES (?, ?, ?) ON CONFLICT(team_id, member_id) DO UPDATE SET is_lead = excluded.is_lead', teamId, memberId, lead ? 1 : 0);
	return !was.length;
}

/** One person by full name and email, optionally straight onto a team. */
peopleRoutes.post('/people/add', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const form = await readForm(c);
	const memberId = await addPerson(c.env.DB, str(form.name), str(form.email));
	if (!memberId) return c.redirect(str(form.name) && str(form.email) ? '/people?error=email' : '/people?error=missing');
	const teamId = id(form.team);
	if (teamId && (await addToTeam(c.env.DB, teamId, memberId))) await notifyTeamAdded(c.env, c.get('viewer'), teamId, memberId);
	return c.redirect('/people?ok=imported');
});

peopleRoutes.get('/people/:id', async (c) => {
	const v = c.get('viewer');
	const personId = id(c.req.param('id'));
	const person = personId ? (await all<BoardRow>(c.env.DB, `${BOARD_SQL} WHERE m.id = ?2`, todayIn(c.env.TIMEZONE), personId))[0] : null;
	if (!person) return c.notFound();
	const today = todayIn(c.env.TIMEZONE);
	const self = person.id === v.id;
	const rolesOk = isExec(v) && (await canManageRoles(c.env.DB, v));
	const [tasks, meetings, memberships, allShared] = await Promise.all([
		all<TaskRow>(
			c.env.DB,
			`${TASK_SELECT} WHERE t.assignee_id = ?2 AND ${visible(v, TASK_VISIBLE)} ORDER BY t.status = 'open' DESC, CASE WHEN t.status = 'open' THEN t.due_date END, t.completed_at DESC LIMIT 60`,
			v.id,
			person.id
		),
		all<MeetingRow & { status: AttendanceStatus }>(
			c.env.DB,
			`SELECT m.*, tm.name AS team_name, tm.kind AS team_kind, a.status FROM attendance a
			 JOIN meetings m ON m.id = a.meeting_id JOIN teams tm ON tm.id = m.team_id
			 WHERE a.member_id = ?2 AND ${visible(v, MEETING_VISIBLE)} ORDER BY m.date DESC LIMIT 30`,
			v.id,
			person.id
		),
		all<Team & { is_lead: number; team_title: string }>(c.env.DB, 'SELECT t.*, x.is_lead, x.title AS team_title FROM team_members x JOIN teams t ON t.id = x.team_id WHERE x.member_id = ? AND t.archived = 0 ORDER BY t.name', person.id),
		boardTasks(c.env.DB, v.id, { assignee: person.id })
	]);
	const shared = allShared.filter((t) => t.team_kind !== 'exec' || isExec(v));
	const open = tasks.filter((t) => t.status === 'open');
	const closed = tasks.filter((t) => t.status !== 'open');

	return page(
		c,
		{ title: person.name, active: 'people' },
		<>
			<PageHead
				eyebrow={person.title || (isOwner(person) ? 'Owner' : person.role === 'exec' ? 'Exec' : 'Member')}
				title={person.name}
				sub={[
					(isExec(v) || self) && person.email,
					person.major,
					person.discord && `Discord: ${person.discord}`,
					person.github && <span class="nowrap">GitHub: <a href={`https://github.com/${encodeURIComponent(person.github)}`} rel="noopener">{person.github}</a></span>,
					memberships.length > 0 && memberships.map((t) => { const about = [t.is_lead && 'lead', t.team_title].filter(Boolean).join(', '); return t.name + (about ? ` (${about})` : ''); }).join(', ')
				]
					.filter(Boolean)
					.flatMap((part, i) => (i ? [' · ', part] : [part]))}
				actions={
					isExec(v) && (
						<a class="btn" href={`/tasks/new?assignee=${person.id}`}>
							Assign a task
						</a>
					)
				}
			/>
			{(isExec(v) || self) && (
				<div class="stats">
					<Stat value={person.open} label="Open" />
					<Stat value={person.overdue} label="Overdue" tone={person.overdue ? 'bad' : undefined} />
					<Stat value={pct(person.on_time, person.done)} label={`On time (${person.done} done)`} />
					<Stat value={attendanceRate(person)} label="Attendance" />
				</div>
			)}
			<div class="grid-2 wide-left">
				<section>
					<h2 class="section-title">Open tasks</h2>
					<TaskList tasks={open} today={today} viewer={v} show={['team', 'meeting']} back={`/people/${person.id}`} empty="No open tasks." />
					{closed.length > 0 && (
						<>
							<h2 class="section-title">Finished</h2>
							<TaskList tasks={closed} today={today} viewer={v} show={['team']} back={`/people/${person.id}`} />
						</>
					)}
					{shared.length > 0 && <>
						<h2 class="section-title">Team board tasks</h2>
						<BoardTaskList tasks={shared} viewer={v} today={today} back={`/people/${person.id}`} />
					</>}
				</section>
				<aside>
					<h2 class="section-title">Meetings</h2>
					{meetings.length ? (
						<ul class="att-list">
							{meetings.map((m) => (
								<li>
									<a href={`/meetings/${m.id}`}>
										{m.title} <span class="muted">· {formatDate(m.date, today)}</span>
									</a>
									<span class={`pill att-${m.status}`}>{m.status}</span>
								</li>
							))}
						</ul>
					) : (
						<Empty>No attendance recorded.</Empty>
					)}
					{isExec(v) && (!isOwner(person) || isOwner(v)) && (
						<details class="card disclose">
							<summary>Edit profile</summary>
							<form method="post" action={`/people/${person.id}`} class="stack">
								<Field label="Name">
									<input name="name" required maxlength={100} value={person.name} />
								</Field>
								<Field label="Email">
									<input type="email" name="email" required maxlength={200} value={person.email} />
								</Field>
								<Field label="Title" hint="Optional, shown next to their name. Like Advisor.">
									<input name="title" maxlength={60} value={person.title} />
								</Field>
								<Field label="Major">
									<input name="major" maxlength={120} value={person.major ?? ''} />
								</Field>
								<Field label="Discord">
									<input name="discord" maxlength={100} value={person.discord} />
								</Field>
								<Field label="GitHub">
									<input name="github" maxlength={100} value={person.github ?? ''} />
								</Field>
								{rolesOk ? (
									<Choice
										name="role"
										label="Role"
										selected={person.role}
										options={[
											['member', 'Member'],
											['exec', 'Exec']
										]}
									/>
								) : (
									<p class="hint">Role: {person.role === 'exec' ? 'Exec' : 'Member'}. Only the site owner can change roles.</p>
								)}
								<label class="check">
									<input type="checkbox" name="active" value="1" checked={!!person.active} /> Active: can sign in and gets reminders
								</label>
								<div>
									<button class="btn primary">Save</button>
								</div>
							</form>
						</details>
					)}
				</aside>
			</div>
		</>
	);
});

peopleRoutes.post('/people/:id', async (c) => {
	const v = c.get('viewer');
	if (!isExec(v)) return forbidden(c);
	const person = await memberById(c.env.DB, id(c.req.param('id')) ?? 0);
	if (!person) return c.notFound();
	const form = await readForm(c);
	const name = str(form.name, 100);
	const email = str(form.email, 200).toLowerCase();
	// The role field is left out of the form for execs who can't change roles.
	const role: Role = form.role === undefined ? person.role : str(form.role) === 'exec' ? 'exec' : 'member';
	const active = str(form.active) === '1' ? 1 : 0;
	if (!name) return c.redirect(`/people/${person.id}?error=missing`);
	if (!isEmail(email)) return c.redirect(`/people/${person.id}?error=email`);
	if (person.id === v.id && (role !== 'exec' || !active)) return c.redirect(`/people/${person.id}?error=self`);
	if (isOwner(person) && !isOwner(v)) return c.redirect(`/people/${person.id}?error=owner`);
	if (role !== person.role && !(await canManageRoles(c.env.DB, v))) return c.redirect(`/people/${person.id}?error=owner`);
	const clash = await memberByEmail(c.env.DB, email);
	if (clash && clash.id !== person.id) return c.redirect(`/people/${person.id}?error=exists`);
	const github = str(form.github, 100).replace(/^@|^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/.*$/, '');
	if (github && !/^[A-Za-z0-9-]{1,39}$/.test(github)) return c.redirect(`/people/${person.id}?error=github`);
	await run(
		c.env.DB,
		'UPDATE members SET name = ?, email = ?, role = ?, title = ?, major = ?, discord = ?, github = ?, active = ? WHERE id = ?',
		name, email, role, str(form.title, 60), str(form.major, 120), str(form.discord, 100), github, active, person.id
	);
	if (!active) await run(c.env.DB, 'DELETE FROM sessions WHERE member_id = ?', person.id);
	return c.redirect(`/people/${person.id}?ok=saved`);
});

// ---------- teams (execs) ----------

export type TeamMemberRow = { team_id: number; member_id: number; is_lead: number; title: string; name: string; role: Role };

/** Execs show as execs on every team; anyone else can be a team's lead. Titles are per team. */
export function MemberTags({ m }: { m: { title: string; role: Role; is_lead: number } }) {
	return (
		<>
			{m.title && <span class="muted team-title">{m.title}</span>}
			{m.role === 'exec' ? <span class="tag exec">Exec</span> : m.is_lead ? <span class="tag lead">Lead</span> : null}
		</>
	);
}

/** An exec's menu for one person on a team: their title there, whether they lead it, or taking them off. */
export function MemberOptions({ team, m }: { team: Pick<Team, 'id' | 'name' | 'kind'>; m: { member_id: number; name: string; title: string; role: Role; is_lead: number } }) {
	return (
		<Menu label={`Options for ${m.name}`} form>
			<form method="post" action={`/teams/${team.id}/members/${m.member_id}`} class="stack">
				<Field label={`Title on ${team.name}`} hint="Optional, e.g. Firmware or Project manager">
					<input name="title" maxlength={60} value={m.title} />
				</Field>
				{m.role === 'exec' ? (
					<span class="hint">Execs run every team, so they show as Exec.</span>
				) : (
					team.kind !== 'exec' && (
						<label class="check">
							<input type="checkbox" name="lead" value="1" checked={!!m.is_lead} /> Lead of {team.name}
						</label>
					)
				)}
				<div>
					<button class="btn primary small">Save</button>
				</div>
			</form>
			<PostButton action={`/teams/${team.id}/members/${m.member_id}/remove`} label={`Remove from ${team.name}`} removeLabel={`Remove ${m.name} from ${team.name}`} cls="item danger" />
		</Menu>
	);
}

/** A team on the Teams page: who runs it, its people (in a dialog), and for execs its settings and adding people. */
export function TeamCard({ team: t, links, people, teamList, editable, open }: { team: Team; links: TeamMemberRow[]; people: Member[]; teamList: Team[]; editable: boolean; open?: number }) {
	const members = links.filter((l) => l.team_id === t.id);
	const execs = members.filter((m) => m.role === 'exec');
	const leads = members.filter((m) => m.is_lead && m.role !== 'exec');
	const others = people.filter((p) => !members.some((m) => m.member_id === p.id));
	const targets = teamList.filter((x) => x.id !== t.id && !x.archived && x.kind === t.kind);
	const names = (list: TeamMemberRow[]) => list.map((m, i) => <>{i > 0 && ', '}<a href={`/people/${m.member_id}`}>{m.name}</a></>);
	return (
		<section class={`card team${t.archived ? ' inactive' : ''}`} id={`team-${t.id}`}>
			<header class="team-head">
				<div>
					<h2><a class="team-card-link" href={`/teams/${t.id}`}>{t.name}</a></h2>
					<p>
						{execs.length ? <>{execs.length === 1 ? 'Exec' : 'Execs'} · {names(execs)}</> : 'No exec assigned'}
						{leads.length > 0 && <>{' · '}{leads.length === 1 ? 'Lead' : 'Leads'} · {names(leads)}</>}
					</p>
					<p>
						{members.length} {members.length === 1 ? 'person' : 'people'}
						{open !== undefined && ` · ${open} open ${open === 1 ? 'task' : 'tasks'}`}
						{t.kind === 'exec' && ' · Execs only'}
					</p>
				</div>
			</header>
			<div class="team-actions">
				<MembersDialog id={`team-${t.id}-members`} name={t.name} count={members.length}>
					{members.length ? (
						<ul class="team-members">
							{members.map((m) => (
								<li>
									<a href={`/people/${m.member_id}`}>{m.name}</a>
									<MemberTags m={m} />
									{editable && <MemberOptions team={t} m={m} />}
								</li>
							))}
						</ul>
					) : (
						<Empty>No members yet.</Empty>
					)}
					{editable && (
						<Menu label={`${t.name} settings`} form>
							<form method="post" action={`/teams/${t.id}`} class="stack">
								<Field label="Name">
									<input name="name" value={t.name} required maxlength={100} />
								</Field>
								<Choice
									name="kind"
									label="Who sees its meetings and tasks"
									selected={t.kind}
									options={[
										['project', 'Its members'],
										['exec', 'Execs only']
									]}
								/>
								<label class="check">
									<input type="checkbox" name="archived" value="1" checked={!!t.archived} /> Archived
								</label>
								<div>
									<button class="btn primary small">Save</button>
								</div>
							</form>
							{targets.length > 0 && (
								<form method="post" action={`/teams/${t.id}/merge`} class="stack" data-confirm={`Combine ${t.name} into the team you picked? Its people, open tasks and upcoming meetings move over, and ${t.name} is archived.`}>
									<Field label="Combine into" hint="Moves its people, open tasks and upcoming meetings, then archives it.">
										<select name="into" required>
											<option value="">Pick a team…</option>
											{targets.map((x) => (
												<option value={String(x.id)}>{x.name}</option>
											))}
										</select>
									</Field>
									<div>
										<button class="btn small">Combine</button>
									</div>
								</form>
							)}
						</Menu>
					)}
				</MembersDialog>
				{editable && (
					<button type="button" class="icon-btn team-add-button" aria-label={`Add someone to ${t.name}`} title={`Add someone to ${t.name}`} aria-haspopup="dialog" aria-controls={`team-${t.id}-add`} data-members-dialog={`team-${t.id}-add`}>
						<span aria-hidden="true">+</span>
					</button>
				)}
			</div>
			{editable && (
				<dialog id={`team-${t.id}-add`} class="members-dialog" aria-labelledby={`team-${t.id}-add-title`}>
					<div class="members-dialog-content stack">
						<header>
							<h2 id={`team-${t.id}-add-title`}>Add someone to {t.name}</h2>
							<form method="dialog">
								<button class="btn small">Close</button>
							</form>
						</header>
						{others.length > 0 ? (
							<form method="post" action={`/teams/${t.id}/members`} class="team-add">
								<MemberSelect name="member" members={others} blank="Type a name" required label={`Add someone to ${t.name}`} />
								<button class="btn small primary">Add</button>
							</form>
						) : (
							<Empty>Everyone on the roster is already on this team.</Empty>
						)}
						<NewPersonForm action={`/teams/${t.id}/members`} heading="Not on the roster yet" />
					</div>
				</dialog>
			)}
		</section>
	);
}

const TEAM_LINKS = "SELECT x.team_id, x.member_id, x.is_lead, x.title, m.name, m.role FROM team_members x JOIN members m ON m.id = x.member_id WHERE m.active = 1 ORDER BY m.role = 'exec' DESC, x.is_lead DESC, x.title = '', m.name COLLATE NOCASE";

peopleRoutes.get('/teams', async (c) => {
	const v = c.get('viewer');
	const editable = isExec(v);
	const [teamList, links, people, counts] = await Promise.all([
		teams(c.env.DB, true),
		all<TeamMemberRow>(c.env.DB, TEAM_LINKS),
		editable ? activeMembers(c.env.DB) : Promise.resolve([]),
		all<{ team_id: number; n: number }>(c.env.DB, `SELECT tt.id AS team_id, (SELECT COUNT(*) FROM tasks t WHERE t.status = 'open' AND ${TASK_ON_TEAM(1).replaceAll('?1', 'tt.id')}) AS n FROM teams tt`)
	]);
	const open = new Map(counts.map((r) => [r.team_id, r.n]));
	// Everyone sees the project teams; exec-only teams are for execs.
	const listedTeams = editable ? teamList : teamList.filter((t) => t.kind !== 'exec');
	const card = (t: Team) => <TeamCard team={t} links={links} people={people} teamList={teamList} editable={editable} open={open.get(t.id) ?? 0} />;
	const archived = listedTeams.filter((t) => t.archived);
	return page(
		c,
		{ title: 'Teams', active: 'teams' },
		<>
			<PageHead
				title="Teams"
				sub={editable ? undefined : 'Every project team in the club. Open one to see its board and meetings.'}
				actions={editable && (
					<button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="add-team-dialog" data-members-dialog="add-team-dialog">
						New team
					</button>
				)}
			/>
			{editable && <dialog id="add-team-dialog" class="members-dialog" aria-labelledby="add-team-title">
				<div class="members-dialog-content stack">
					<header>
						<h2 id="add-team-title">Add team</h2>
						<form method="dialog"><button class="btn small">Close</button></form>
					</header>
					<form method="post" action="/teams" class="stack">
						<Field label="Team name"><input name="name" required maxlength={100} placeholder="New team name" /></Field>
						<div><button class="btn primary">Add team</button></div>
					</form>
				</div>
			</dialog>}
			<div class="teams">{listedTeams.filter((t) => !t.archived).map(card)}</div>
			{archived.length > 0 && (
				<details class="archived-teams">
					<summary>Archived teams ({archived.length})</summary>
					<div class="teams">{archived.map(card)}</div>
				</details>
			)}
		</>
	);
});

/** Moves a team's people, open tasks and upcoming meetings into another team, then archives it. */
peopleRoutes.post('/teams/:id/merge', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const from = id(c.req.param('id'));
	const into = id((await readForm(c)).into);
	if (!from || !into || from === into) return c.redirect(`/teams/${from}?error=missing`);
	const db = c.env.DB;
	const today = todayIn(c.env.TIMEZONE);
	const upcoming = 'SELECT meeting_id FROM meeting_teams WHERE team_id = ?1 AND meeting_id IN (SELECT id FROM meetings WHERE date >= ?3)';
	await db.batch([
		db.prepare('INSERT INTO team_members (team_id, member_id, is_lead) SELECT ?2, member_id, is_lead FROM team_members WHERE team_id = ?1 ON CONFLICT(team_id, member_id) DO UPDATE SET is_lead = MAX(is_lead, excluded.is_lead)').bind(from, into),
		db.prepare("UPDATE tasks SET team_id = ?2 WHERE team_id = ?1 AND status = 'open'").bind(from, into),
		db.prepare(`UPDATE meetings SET team_id = ?2 WHERE team_id = ?1 AND date >= ?3`).bind(from, into, today),
		db.prepare(`INSERT OR IGNORE INTO meeting_teams (meeting_id, team_id) SELECT meeting_id, ?2 FROM meeting_teams WHERE team_id = ?1 AND meeting_id IN (SELECT id FROM meetings WHERE date >= ?3)`).bind(from, into, today),
		db.prepare(`DELETE FROM meeting_teams WHERE team_id = ?1 AND meeting_id IN (${upcoming})`).bind(from, into, today),
		db.prepare('UPDATE teams SET archived = 1 WHERE id = ?').bind(from)
	]);
	return c.redirect(`/teams/${into}?ok=saved`);
});

/** Back to the team's own page when that's where the change was made, else the Teams page. */
function teamBack(c: { req: { header: (n: string) => string | undefined } }, teamId: number | null) {
	const ref = c.req.header('referer') ?? '';
	return ref.includes(`/teams/${teamId}`) && !ref.includes(`/teams/${teamId}/`) ? `/teams/${teamId}?ok=saved` : `/teams?ok=saved#team-${teamId}`;
}

peopleRoutes.post('/teams', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const form = await readForm(c);
	const name = str(form.name, 100);
	if (!name) return c.redirect('/teams?error=missing');
	await run(c.env.DB, 'INSERT INTO teams (name, kind) VALUES (?, ?) ON CONFLICT(name) DO NOTHING', name, str(form.kind) === 'exec' ? 'exec' : 'project');
	return c.redirect('/teams?ok=created');
});

peopleRoutes.post('/teams/:id', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const teamId = id(c.req.param('id'));
	const form = await readForm(c);
	const name = str(form.name, 100);
	if (!teamId || !name) return c.redirect('/teams?error=missing');
	await run(c.env.DB, 'UPDATE teams SET name = ?, kind = ?, archived = ? WHERE id = ?', name, str(form.kind) === 'exec' ? 'exec' : 'project', str(form.archived) === '1' ? 1 : 0, teamId);
	return c.redirect(teamBack(c, teamId));
});

peopleRoutes.post('/teams/:id/members', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const teamId = id(c.req.param('id'));
	const form = await readForm(c);
	// Someone on the roster, or someone new by full name and email.
	const memberId = id(form.member) ?? (str(form.email) ? await addPerson(c.env.DB, str(form.name), str(form.email)) : null);
	if (!teamId || !memberId) return c.redirect(`/teams?error=${str(form.email) && str(form.name) ? 'email' : 'missing'}`);
	if (await addToTeam(c.env.DB, teamId, memberId, str(form.lead) === '1')) await notifyTeamAdded(c.env, c.get('viewer'), teamId, memberId);
	return c.redirect(teamBack(c, teamId));
});

/** A person's title on a team and whether they lead it. Execs are never leads: they run every team. */
peopleRoutes.post('/teams/:id/members/:member', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const teamId = id(c.req.param('id'));
	const form = await readForm(c);
	await run(
		c.env.DB,
		"UPDATE team_members SET title = ?, is_lead = ? * (SELECT role != 'exec' FROM members WHERE id = member_id) WHERE team_id = ? AND member_id = ?",
		str(form.title, 60),
		str(form.lead) === '1' ? 1 : 0,
		teamId ?? 0,
		id(c.req.param('member')) ?? 0
	);
	return c.redirect(teamBack(c, teamId));
});

peopleRoutes.post('/teams/:id/members/:member/remove', async (c) => {
	if (!isExec(c.get('viewer'))) return forbidden(c);
	const teamId = id(c.req.param('id'));
	await run(c.env.DB, 'DELETE FROM team_members WHERE team_id = ? AND member_id = ?', teamId ?? 0, id(c.req.param('member')) ?? 0);
	return c.redirect(teamBack(c, teamId));
});

/** Full name and email for someone not on the roster yet; with `teams`, a team to put them on. */
function NewPersonForm({ action, teams, heading }: { action: string; teams?: Pick<Team, 'id' | 'name'>[]; heading?: string }) {
	return (
		<form method="post" action={action} class="stack new-person">
			{heading && <p class="label">{heading}</p>}
			<div class="field-pair">
				<Field label="Full name">
					<input name="name" required maxlength={100} autocomplete="off" />
				</Field>
				<Field label="Email">
					<input type="email" name="email" required maxlength={200} autocomplete="off" />
				</Field>
			</div>
			{teams && (
				<Field label="Team">
					<TeamSelect name="team" teams={teams} blank="No team" />
				</Field>
			)}
			<div>
				<button class="btn primary small">Add</button>
			</div>
		</form>
	);
}
