import { Hono, type Context } from 'hono';
import { boardTasks } from '../board';
import { addDays, todayIn } from '../dates';
import { all, first, MEETING_SELECT, MEETING_VISIBLE, run, TASK_ON_TEAM, TASK_SELECT, TASK_VISIBLE, visible as canSee } from '../db';
import { id, isHttpUrl, list, readForm, str } from '../form';
import { isExec } from '../perm';
import type { AppEnv, Member, MeetingRow, TaskRow, Team } from '../types';
import { Kanban } from '../views/board';
import { page } from '../views/layout';
import { Empty, Field, Markdown, MemberSelect, MembersDialog, netIds, PageHead, PersonName, PostButton } from '../views/ui';
import { TaskForm } from './board-tasks';
import { MeetingList } from './home';
import { MemberOptions, MemberTags } from './people';
import { teamLibrary, TeamLibrary } from './team-library';

export const teamPageRoutes = new Hono<AppEnv>();
export type Subteam = { id: number; team_id: number; name: string; description: string; archived: number };
export type RosterMember = Pick<Member, 'id' | 'name' | 'email' | 'role' | 'available_hours'> & { is_lead: number; title: string; can_manage_page: number };

export function teamRoster(db: D1Database, team: number) {
	return all<RosterMember>(db, `SELECT m.id, m.name, m.email, m.role, m.available_hours, tm.is_lead, tm.title, tm.can_manage_page
	 FROM team_members tm JOIN members m ON m.id = tm.member_id
	 WHERE tm.team_id = ? AND m.active = 1 ORDER BY m.role = 'exec' DESC, tm.is_lead DESC, tm.title = '', m.name COLLATE NOCASE`, team);
}

export function teamSubteams(db: D1Database, team: number) {
	return all<Subteam>(db, 'SELECT * FROM subteams WHERE team_id = ? ORDER BY archived, name COLLATE NOCASE', team);
}

export function SubteamCards({ root, subteams, members, subRoster, editable }: { root: string; subteams: Subteam[]; members: RosterMember[]; subRoster: { subteam_id: number; member_id: number }[]; editable: boolean }) {
	const visible = subteams.filter((subteam) => !subteam.archived || editable);
	if (!visible.length && !editable) return null;
	return <section class="subteams-section" aria-labelledby="subteams-heading">
		<div class="subteams-heading"><h2 id="subteams-heading" class="section-title">Subteams</h2>
			{editable && <button type="button" class="icon-btn team-add-button" aria-label="Add subteam" title="Add subteam" aria-haspopup="dialog" aria-controls="new-subteam" data-members-dialog="new-subteam">+</button>}</div>
		{visible.length ? <div class="teams">{visible.map((subteam) => <section class={`card team${subteam.archived ? ' inactive' : ''}`}>
			<header class="team-head"><div><h2><a class="team-card-link" href={`${root}/subteams/${subteam.id}`}>{subteam.name}</a></h2>
				{subteam.description && <p>{subteam.description}</p>}{!!subteam.archived && <p>Archived</p>}</div></header>
			<div class="team-actions">{rosterPanel(`subteam-card-${subteam.id}-members`, subteam.name, members.filter((m) => subRoster.some((r) => r.subteam_id === subteam.id && r.member_id === m.id)))}
				{editable && !subteam.archived && <SubteamAddMember root={root} subteam={subteam} members={members} subRoster={subRoster} origin="team" />}</div>
		</section>)}</div> : <p class="hint">No subteams yet.</p>}
		{editable && <dialog id="new-subteam" class="members-dialog" aria-labelledby="new-subteam-title">
			<div class="members-dialog-content stack"><header><h2 id="new-subteam-title">Add subteam</h2><form method="dialog"><button class="btn small">Close</button></form></header>
				<form class="stack" method="post" action={`${root}/subteams`}><Field label="Subteam name"><input name="name" maxlength={100} required /></Field><div><button class="btn small primary">Create subteam</button></div></form>
			</div></dialog>}
	</section>;
}

function SubteamAddMember({ root, subteam, members, subRoster, origin }: { root: string; subteam: Subteam; members: RosterMember[]; subRoster: { subteam_id: number; member_id: number }[]; origin: 'team' | 'subteam' }) {
	const dialogId = `subteam-${subteam.id}-add-${origin}`;
	const available = members.filter((member) => !subRoster.some((entry) => entry.subteam_id === subteam.id && entry.member_id === member.id));
	return <div class="subteam-add-member">
		<button type="button" class="icon-btn team-add-button" aria-label={`Add member to ${subteam.name}`} title={`Add member to ${subteam.name}`} aria-haspopup="dialog" aria-controls={dialogId} data-members-dialog={dialogId}>+</button>
		<dialog id={dialogId} class="members-dialog" aria-labelledby={`${dialogId}-title`}><div class="members-dialog-content stack">
			<header><h2 id={`${dialogId}-title`}>Add member to {subteam.name}</h2><form method="dialog"><button class="btn small">Close</button></form></header>
			{available.length ? <form method="post" action={`${root}/subteams/${subteam.id}/members`} class="stack">
				<input type="hidden" name="origin" value={origin} />
				<Field label="Team member"><MemberSelect name="member" members={available} blank="Choose a team member" required /></Field>
				<div><button class="btn primary small">Add member</button></div>
			</form> : <p class="hint">All team members are already in this subteam.</p>}
		</div></dialog>
	</div>;
}

function rosterPanel(id: string, name: string, members: RosterMember[], grantPath?: string, team?: Pick<Team, 'id' | 'name' | 'kind'>) {
	return (
		<MembersDialog id={id} name={name} count={members.length}>
			{members.length ? <ul class="team-members">{members.map((m) => (
				<li><a href={`/people/${m.id}`}>{m.name}</a> <MemberTags m={m} />
					<span class="hint">{m.available_hours == null ? 'Hours not set' : `${m.available_hours} h/week`}</span>
					{m.can_manage_page ? <span class="tag">Page admin</span> : null}
					{grantPath && <PostButton action={`${grantPath}/${m.id}`} name="enabled" value={m.can_manage_page ? '0' : '1'}
						label={m.can_manage_page ? 'Remove page access' : 'Grant page access'} removeLabel={m.can_manage_page ? `Remove page access for ${m.name}` : undefined} cls="btn small" />}
					{team && <MemberOptions team={team} m={{ ...m, member_id: m.id }} />}
				</li>
			))}</ul> : <Empty>No members yet.</Empty>}
		</MembersDialog>
	);
}

async function canManagePage(db: D1Database, viewer: AppEnv['Variables']['viewer'], team: number) {
	return isExec(viewer) || !!await first(db, 'SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ? AND can_manage_page = 1', team, viewer.id);
}

const renderTeamPage = async (c: Context<AppEnv>) => {
	const v = c.get('viewer');
	const db = c.env.DB;
	const team = await first<Team>(db, 'SELECT * FROM teams WHERE id = ?', id(c.req.param('id')));
	if (!team || (team.kind === 'exec' && !isExec(v))) return c.notFound();
	const root = `/teams/${team.id}`;
	const today = todayIn(c.env.TIMEZONE);
	const [members, subteams] = await Promise.all([teamRoster(db, team.id), teamSubteams(db, team.id)]);
	const editable = isExec(v) || members.some((m) => m.id === v.id && m.can_manage_page);
	const visible = subteams.filter((s) => !s.archived || editable);
	const legacySubteam = c.req.query('subteam');
	if (!c.req.param('subteam') && legacySubteam && id(legacySubteam)) return c.redirect(`${root}/subteams/${id(legacySubteam)}`);
	const subteamId = c.req.param('subteam') ? id(c.req.param('subteam')) : null;
	const selected = subteamId ? visible.find((s) => s.id === subteamId) : undefined;
	if (c.req.param('subteam') && !selected) return c.notFound();
	const selectedIds = selected ? [selected.id] : [];
	const selectedSubteams = selected ? [selected] : [];
	const back = selected ? `${root}/subteams/${selected.id}` : root;
	const meetingsOn = `m.id IN (SELECT meeting_id FROM meeting_teams WHERE team_id = ?2) AND ${canSee(v, MEETING_VISIBLE)}`;
	const [tasks, legacy, subRoster, library, upcoming, recent] = await Promise.all([
		boardTasks(db, v.id, { team: team.id, subteams: selectedIds }),
		// The hub's regular tasks for this team, as the viewer may see them; finished ones for 30 days.
		selectedIds.length ? Promise.resolve([]) : all<TaskRow>(db, `${TASK_SELECT} WHERE ${TASK_ON_TEAM(2)} AND ${canSee(v, TASK_VISIBLE)} AND (t.status = 'open' OR t.completed_at >= ?3) ORDER BY t.due_date, t.id LIMIT 300`, v.id, team.id, addDays(today, -30)),
		all<{ subteam_id: number; member_id: number }>(db, 'SELECT subteam_id, member_id FROM subteam_members WHERE team_id = ?', team.id),
		teamLibrary(db, v, team.id),
		selected ? Promise.resolve([]) : all<MeetingRow>(db, `${MEETING_SELECT} WHERE ${meetingsOn} AND m.date >= ?3 ORDER BY m.date, m.time LIMIT 10`, v.id, team.id, today),
		selected ? Promise.resolve([]) : all<MeetingRow>(db, `${MEETING_SELECT} WHERE ${meetingsOn} AND m.date < ?3 ORDER BY m.date DESC, m.time DESC LIMIT 5`, v.id, team.id, today)
	]);
	const canCreate = !team.archived && !selected?.archived && (isExec(v) || v.teamIds.has(team.id));
	const manager = isExec(v) || v.leadOf.has(team.id);
	const execs = members.filter((member) => member.role === 'exec');
	const resources = [['Discord', team.discord_url], ['Drive', team.drive_url], ['GitHub', team.github_url]].filter(([, url]) => url && isHttpUrl(url));
	return page(c, { title: selected?.name ?? team.name, active: 'teams' }, <>
		<PageHead eyebrow={selected ? team.name : 'Teams'} title={<span class="team-title">{selected?.name ?? team.name}
			{!selected && editable && <button type="button" class="icon-btn team-settings-button" aria-label="Edit team page" title="Edit team page" aria-haspopup="dialog" aria-controls="team-settings" data-members-dialog="team-settings">
				<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
			</button>}</span>} sub={team.archived || selected?.archived ? 'Archived' : undefined}
			actions={<>
				{!selected && manager && !team.archived && <a class="btn" href="/meetings/new">New meeting</a>}
				{canCreate && <button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="new-team-task" data-members-dialog="new-team-task">New task</button>}
			</>} />
		{canCreate && <dialog id="new-team-task" class="members-dialog" aria-labelledby="new-team-task-title">
			<div class="members-dialog-content stack">
				<header><h2 id="new-team-task-title">New team task</h2><form method="dialog"><button class="btn small">Close</button></form></header>
				<TaskForm action={`${root}/board`} due={addDays(todayIn(c.env.TIMEZONE), 7)} members={manager ? members : undefined} returnToBoard returnPath={back}
					subteams={manager ? subteams.filter((s) => !s.archived) : undefined}
					assignedPeople={new Set(!selectedIds.length && v.teamIds.has(team.id) ? [v.id] : [])} assignedSubteams={new Set(manager ? selectedIds : [])} />
			</div>
		</dialog>}
		<div class="stack">
			{selected && <p><a href={root}>← {team.name}</a></p>}
			{!selected && <>
			<div class="team-overview">
				<Markdown text={team.description} empty="No team description yet." />
				{rosterPanel(`team-${team.id}-members`, team.name, members, isExec(v) ? `${root}/page-admins` : undefined, isExec(v) ? team : undefined)}
			</div>
			{resources.length > 0 && <nav class="team-resource-links" aria-label="Team links">{resources.map(([label, url]) =>
				<a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`} title={label}>
					{label === 'Discord' ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.7 5.3A18 18 0 0 0 15.3 4l-.5 1a16.5 16.5 0 0 0-5.6 0l-.5-1a18 18 0 0 0-4.4 1.3C1.5 9.5.8 13.6 1.2 17.6a18 18 0 0 0 5.4 2.7l1.2-1.9-1.8-.9.4-.3a12.8 12.8 0 0 0 11.2 0l.4.3-1.8.9 1.2 1.9a18 18 0 0 0 5.4-2.7c.5-4.6-.8-8.7-3.1-12.3ZM8.5 15.2c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm7 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z"/></svg>
						: label === 'Drive' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 3h7l7 12-3.5 6h-14L1.5 15 8.5 3Z"/><path d="m8.5 3 7 12m-11 6 7-12m-10 6h21"/></svg>
						: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.15c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.62 1.22 3.26.93.1-.72.39-1.22.7-1.5-2.51-.29-5.15-1.26-5.15-5.58 0-1.23.44-2.24 1.15-3.03-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.16a10.7 10.7 0 0 1 5.6 0c2.14-1.46 3.08-1.16 3.08-1.16.61 1.55.23 2.7.11 2.98.71.79 1.15 1.8 1.15 3.03 0 4.33-2.65 5.29-5.17 5.57.4.35.76 1.03.76 2.08v3.16c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>}
				</a>)}</nav>}
			<p class="team-exec">{execs.length ? <>{execs.length === 1 ? 'Exec' : 'Execs'} · {execs.map((member, index) => <>{index > 0 && ', '}<a href={`/people/${member.id}`}>{member.name}</a></>)}{team.cal_url && <> · <a href={team.cal_url} target="_blank" rel="noopener noreferrer">Book on Cal.com ↗</a></>}</> : 'No exec assigned'}</p>
			{editable && (
				<dialog id="team-settings" class="members-dialog" aria-labelledby="team-settings-title">
					<div class="members-dialog-content stack">
					<header><h2 id="team-settings-title">Team settings</h2><form method="dialog"><button class="btn small">Close</button></form></header>
					<form class="form-grid" method="post" action={`${root}/profile`}>
						<Field label="What the team is working on" wide><textarea name="description" rows={3} maxlength={5000}>{team.description}</textarea></Field>
						<Field label="Discord"><input type="url" name="discord" value={team.discord_url ?? ''} maxlength={2048} /></Field>
						<Field label="Drive"><input type="url" name="drive" value={team.drive_url ?? ''} maxlength={2048} /></Field>
						<Field label="GitHub"><input type="url" name="github" value={team.github_url ?? ''} maxlength={2048} /></Field>
						<Field label="Exec Cal.com link"><input type="url" name="cal" value={team.cal_url ?? ''} maxlength={2048} placeholder="https://cal.com/…" /></Field>
						<div class="wide"><button class="btn small primary">Save team page</button></div>
					</form>
					</div>
				</dialog>
			)}

			<SubteamCards root={root} subteams={subteams} members={members} subRoster={subRoster} editable={editable} />
			</>}
			<div class="task-board-heading"><h2 class="section-title">Task board</h2></div>
			{selectedSubteams.map((selected) => (
				<section class="stack">
					<div class="subteam-heading">
						<div>
							<h2 class="section-title">{selected.name}{editable && <button type="button" class="icon-btn team-settings-button" aria-label="Edit subteam" title="Edit subteam" aria-haspopup="dialog" aria-controls={`subteam-settings-${selected.id}`} data-members-dialog={`subteam-settings-${selected.id}`}>
								<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
							</button>}</h2>
							{selected.description && <Markdown text={selected.description} />}
						</div>
						<div class="subteam-member-actions">{rosterPanel(`subteam-${selected.id}-members`, selected.name, members.filter((m) => subRoster.some((r) => r.subteam_id === selected.id && r.member_id === m.id)))}
							{editable && !selected.archived && <SubteamAddMember root={root} subteam={selected} members={members} subRoster={subRoster} origin="subteam" />}</div>
					</div>
					{editable && <dialog id={`subteam-settings-${selected.id}`} class="members-dialog" aria-labelledby={`subteam-settings-title-${selected.id}`}>
						<div class="members-dialog-content stack">
						<header><h2 id={`subteam-settings-title-${selected.id}`}>Edit subteam</h2><form method="dialog"><button class="btn small">Close</button></form></header>
						<form method="post" action={`${root}/subteams/${selected.id}`} class="stack">
							<Field label="Name"><input name="name" required maxlength={100} value={selected.name} /></Field>
							<Field label="What the subteam is working on"><textarea name="description" maxlength={5000} rows={3}>{selected.description}</textarea></Field>
							<label class="check"><input type="checkbox" name="archived" value="1" checked={!!selected.archived} /> Archived</label>
							<fieldset>
								<legend>Subteam members</legend>
								<div class="selection-grid">{members.map((m) => (
									<label class="check"><input type="checkbox" name="member" value={m.id} checked={subRoster.some((r) => r.subteam_id === selected.id && r.member_id === m.id)} /> <PersonName p={m} netId={netIds(members)} /></label>
								))}</div>
							</fieldset>
							<div><button class="btn small primary">Save subteam</button></div>
						</form>
						</div>
					</dialog>}
				</section>
			))}
			<Kanban tasks={tasks} legacy={legacy} viewer={v} today={today} back={back} canCreate={canCreate} />
			{!selected && <div class="grid-2">
				<section>
					<h2 class="section-title">Upcoming meetings</h2>
					<MeetingList meetings={upcoming} today={today} />
				</section>
				{recent.length > 0 && <section>
					<h2 class="section-title">Recent meetings</h2>
					<MeetingList meetings={recent} today={today} />
				</section>}
			</div>}
			{!selected && <TeamLibrary items={library} root={root} subteams={selectedIds} filters={{ type: c.req.query('library_type') ?? '', person: c.req.query('library_person') ?? '', creator: c.req.query('library_creator') ?? '', meeting: c.req.query('library_meeting') ?? '', group: c.req.query('library_group') ?? '' }} />}
		</div>
	</>);
};
teamPageRoutes.get('/teams/:id', renderTeamPage);
teamPageRoutes.get('/teams/:id/subteams/:subteam', renderTeamPage);

teamPageRoutes.post('/teams/:id/profile', async (c) => {
	const team = id(c.req.param('id'));
	if (!team || !await canManagePage(c.env.DB, c.get('viewer'), team)) return c.notFound();
	const form = await readForm(c);
	const links = [str(form.discord, 2048), str(form.drive, 2048), str(form.github, 2048)];
	const cal = str(form.cal, 2048);
	const path = `/teams/${team}`;
	if (links.some((url) => url && (!isHttpUrl(url) || new URL(url).protocol !== 'https:'))) return c.redirect(`${path}?error=link`);
	if (cal && (!isHttpUrl(cal) || new URL(cal).protocol !== 'https:' || !['cal.com', 'www.cal.com'].includes(new URL(cal).hostname.toLowerCase()))) return c.redirect(`${path}?error=cal`);
	await run(c.env.DB, 'UPDATE teams SET description = ?, discord_url = ?, drive_url = ?, github_url = ?, cal_url = ? WHERE id = ?', str(form.description), ...links, cal, team);
	return c.redirect(`${path}?ok=saved`);
});

teamPageRoutes.post('/teams/:id/page-admins/:member', async (c) => {
	if (!isExec(c.get('viewer'))) return c.notFound();
	const team = id(c.req.param('id'));
	const member = id(c.req.param('member'));
	if (!team || !member) return c.notFound();
	const enabled = str((await readForm(c)).enabled);
	if (enabled !== '1' && enabled !== '0') return c.notFound();
	await run(c.env.DB, 'UPDATE team_members SET can_manage_page = ? WHERE team_id = ? AND member_id = ?', Number(enabled), team, member);
	return c.redirect(`/teams/${team}?ok=saved`);
});

teamPageRoutes.post('/teams/:id/subteams', async (c) => {
	const team = id(c.req.param('id'));
	if (!team || !await canManagePage(c.env.DB, c.get('viewer'), team)) return c.notFound();
	const form = await readForm(c);
	const name = str(form.name, 100);
	if (!name) return c.redirect(`/teams/${team}?error=missing`);
	const result = await run(c.env.DB, `INSERT INTO subteams (team_id, name)
	 SELECT id, ? FROM teams WHERE id = ? ON CONFLICT (team_id, name) DO NOTHING`, name, team);
	return c.redirect(result.meta.changes ? `/teams/${team}/subteams/${result.meta.last_row_id}?ok=created` : `/teams/${team}?error=exists`);
});

teamPageRoutes.post('/teams/:id/subteams/:subteam/members', async (c) => {
	const team = id(c.req.param('id'));
	const subteam = id(c.req.param('subteam'));
	if (!team || !subteam || !await canManagePage(c.env.DB, c.get('viewer'), team)) return c.notFound();
	const form = await readForm(c);
	const member = id(form.member);
	const path = str(form.origin) === 'team' ? `/teams/${team}` : `/teams/${team}/subteams/${subteam}`;
	if (!member) return c.redirect(`${path}?error=selection`);
	const result = await run(c.env.DB, `INSERT INTO subteam_members (subteam_id, team_id, member_id)
		SELECT s.id, s.team_id, m.id FROM subteams s JOIN team_members tm ON tm.team_id = s.team_id
		JOIN members m ON m.id = tm.member_id AND m.active = 1
		WHERE s.id = ? AND s.team_id = ? AND s.archived = 0 AND m.id = ?
		ON CONFLICT (subteam_id, member_id) DO NOTHING`, subteam, team, member);
	return c.redirect(`${path}?${result.meta.changes ? 'ok=saved' : 'error=selection'}`);
});

teamPageRoutes.post('/teams/:id/subteams/:subteam', async (c) => {
	const team = id(c.req.param('id'));
	const subteam = id(c.req.param('subteam'));
	const db = c.env.DB;
	if (!team || !subteam || !await canManagePage(db, c.get('viewer'), team)
		|| !await first(db, 'SELECT 1 FROM subteams WHERE id = ? AND team_id = ?', subteam, team)) return c.notFound();
	const path = `/teams/${team}/subteams/${subteam}`;
	const form = await readForm(c);
	const name = str(form.name, 100);
	if (!name) return c.redirect(`${path}?error=missing`);
	if (await first(db, 'SELECT 1 FROM subteams WHERE team_id = ? AND name = ? AND id != ?', team, name, subteam)) return c.redirect(`${path}?error=exists`);
	const members = [...new Set(list(form.member).map(id))];
	const eligible = new Set((await teamRoster(db, team)).map((m) => m.id));
	if (members.some((m) => m === null || !eligible.has(m))) return c.redirect(`${path}?error=selection`);
	await db.batch([
		db.prepare('UPDATE subteams SET name = ?, description = ?, archived = ? WHERE id = ? AND team_id = ?')
			.bind(name, str(form.description), str(form.archived) === '1' ? 1 : 0, subteam, team),
		db.prepare(`DELETE FROM subteam_members WHERE subteam_id = ?
		 AND member_id IN (SELECT id FROM members WHERE active = 1)
		 AND member_id NOT IN (SELECT value FROM json_each(?))`).bind(subteam, JSON.stringify(members)),
		db.prepare(`INSERT INTO subteam_members (subteam_id, team_id, member_id)
		 SELECT ?, ?, value FROM json_each(?) WHERE 1 ON CONFLICT (subteam_id, member_id) DO NOTHING`).bind(subteam, team, JSON.stringify(members))
	]);
	return c.redirect(`${path}?ok=saved`);
});
