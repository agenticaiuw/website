import { error, redirect } from '@sveltejs/kit';
import { boardTasks } from '$lib/server/board';
import { todayIn } from '$lib/dates';
import { all, MEETING_VISIBLE, memberByEmail, memberById, run, TASK_SELECT, TASK_VISIBLE, visible } from '$lib/server/db';
import { id, isEmail, readForm, str } from '$lib/server/form';
import { BOARD_SQL, boardPerson, type BoardRow } from '$lib/server/people';
import { canManageRoles, isExec, isOwner } from '$lib/server/perm';
import type { AttendanceStatus, MeetingRow, Role, TaskRow, Team } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { env, viewer: v } }) => {
	const db = env.DB;
	const today = todayIn(env.TIMEZONE);
	const personId = id(params.id);
	const row = personId ? (await all<BoardRow>(db, `${BOARD_SQL} WHERE m.id = ?2`, today, personId))[0] : null;
	if (!row) error(404, 'Not found');
	const self = row.id === v.id;
	const exec = isExec(v);
	const rolesOk = exec && (await canManageRoles(db, v));
	const [tasks, meetings, memberships, allShared] = await Promise.all([
		all<TaskRow>(
			db,
			`${TASK_SELECT} WHERE t.assignee_id = ?2 AND ${visible(v, TASK_VISIBLE)} ORDER BY t.status = 'open' DESC, CASE WHEN t.status = 'open' THEN t.due_date END, t.completed_at DESC LIMIT 60`,
			v.id,
			row.id
		),
		all<MeetingRow & { status: AttendanceStatus }>(
			db,
			`SELECT m.*, tm.name AS team_name, tm.kind AS team_kind, a.status FROM attendance a
			 JOIN meetings m ON m.id = a.meeting_id JOIN teams tm ON tm.id = m.team_id
			 WHERE a.member_id = ?2 AND ${visible(v, MEETING_VISIBLE)} ORDER BY m.date DESC LIMIT 30`,
			v.id,
			row.id
		),
		all<Team & { is_lead: number; team_title: string }>(
			db,
			'SELECT t.*, x.is_lead, x.title AS team_title FROM team_members x JOIN teams t ON t.id = x.team_id WHERE x.member_id = ? AND t.archived = 0 ORDER BY t.name',
			row.id
		),
		boardTasks(db, v.id, { assignee: row.id })
	]);
	// Email and stats are for execs and the person themself.
	const person = { ...boardPerson(row), email: exec || self ? row.email : '', discord: row.discord, github: row.github ?? '' };
	return {
		title: row.name,
		active: 'people' as const,
		today,
		person,
		self,
		rolesOk,
		canEdit: exec && (!isOwner(row) || isOwner(v)),
		open: tasks.filter((t) => t.status === 'open'),
		closed: tasks.filter((t) => t.status !== 'open'),
		meetings: meetings.map(({ id, title, date, status }) => ({ id, title, date, status })),
		memberships: memberships.map(({ name, is_lead, team_title }) => ({ name, is_lead, team_title })),
		shared: allShared.filter((t) => t.team_kind !== 'exec' || exec)
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals: { env, viewer: v } }) => {
		if (!isExec(v)) redirect(303, '/?error=forbidden');
		const person = await memberById(env.DB, id(params.id) ?? 0);
		if (!person) error(404, 'Not found');
		const back = `/people/${person.id}`;
		const form = await readForm(request);
		const name = str(form.name, 100);
		const email = str(form.email, 200).toLowerCase();
		// The role field is left out of the form for execs who can't change roles.
		const role: Role = form.role === undefined ? person.role : str(form.role) === 'exec' ? 'exec' : 'member';
		const active = str(form.active) === '1' ? 1 : 0;
		if (!name) redirect(303, `${back}?error=missing`);
		if (!isEmail(email)) redirect(303, `${back}?error=email`);
		if (person.id === v.id && (role !== 'exec' || !active)) redirect(303, `${back}?error=self`);
		if (isOwner(person) && !isOwner(v)) redirect(303, `${back}?error=owner`);
		if (role !== person.role && !(await canManageRoles(env.DB, v))) redirect(303, `${back}?error=owner`);
		const clash = await memberByEmail(env.DB, email);
		if (clash && clash.id !== person.id) redirect(303, `${back}?error=exists`);
		const github = str(form.github, 100)
			.replace(/^@|^https?:\/\/(www\.)?github\.com\//i, '')
			.replace(/\/.*$/, '');
		if (github && !/^[A-Za-z0-9-]{1,39}$/.test(github)) redirect(303, `${back}?error=github`);
		await run(
			env.DB,
			'UPDATE members SET name = ?, email = ?, role = ?, title = ?, major = ?, discord = ?, github = ?, active = ? WHERE id = ?',
			name,
			email,
			role,
			str(form.title, 60),
			str(form.major, 120),
			str(form.discord, 100),
			github,
			active,
			person.id
		);
		if (!active) await run(env.DB, 'DELETE FROM sessions WHERE member_id = ?', person.id);
		redirect(303, `${back}?ok=saved`);
	}
};
