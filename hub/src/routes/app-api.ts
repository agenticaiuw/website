import { Hono, type Context } from 'hono';
import { bearerMember, createLoginCode, endBearerSession, memberForLogin, newSessionToken, useLoginCode } from '../auth';
import { addDays, todayIn } from '../dates';
import { BOARD_STATUSES, boardLog, boardTask, boardTaskHref, boardTasks, type BoardTask } from '../board';
import { all, loadViewer, MEETING_SELECT, meetingTeams, setTaskStatus, TASK_SELECT, taskById } from '../db';
import { loginEmail } from '../emails';
import { isEmail, str } from '../form';
import { sendMail } from '../mail';
import { canCompleteTask, isExec } from '../perm';
import type { AppEnv, MeetingRow, TaskRow, Viewer } from '../types';

/**
 * The JSON API for The Hub's iPhone app. It signs in with the same emailed code as the website,
 * and gets back a session token to send as `Authorization: Bearer <token>`. The app reads the
 * signed-in person's tasks and meetings, writes them into Apple Reminders and Calendar, and marks
 * tasks done or open again when they're checked off there.
 */
export const appApiRoutes = new Hono<AppEnv>();

type Body = Record<string, unknown>;
const body = async (c: { req: { json: () => Promise<unknown> } }): Promise<Body> => {
	const b = await c.req.json().catch(() => ({}));
	return b && typeof b === 'object' ? (b as Body) : {};
};

/** Days of meetings and finished tasks the app keeps, so ones that end or are canceled come off Calendar and Reminders. */
const PAST_DAYS = 14;
const AHEAD_DAYS = 120;

// Sends a sign-in code. The answer is the same whether or not the email is on the roster.
appApiRoutes.post('/api/app/code', async (c) => {
	const email = str((await body(c)).email, 200).toLowerCase();
	let devCode: string | undefined;
	if (isEmail(email)) {
		const member = await memberForLogin(c.env, email);
		const code = member && (await createLoginCode(c.env, member));
		if (member && code) {
			await sendMail(c.env, { to: { name: member.name, email: member.email }, kind: 'login', ...loginEmail(member.name, code, c.env.APP_URL) });
			if (c.env.DEV_MODE) devCode = code;
		}
	}
	return c.json({ ok: true, ...(devCode ? { dev_code: devCode } : {}) });
});

appApiRoutes.post('/api/app/session', async (c) => {
	const b = await body(c);
	const email = str(b.email, 200).toLowerCase();
	const member = await useLoginCode(c.env, email, str(b.code, 20).replace(/\s/g, ''));
	if (!member) return c.json({ error: 'That code is wrong or has expired. Check your latest email, or send a new code.' }, 401);
	const { token, expires } = await newSessionToken(c.env, member.id);
	return c.json({ token, expires_at: expires.toISOString(), member: { id: member.id, name: member.name, email: member.email, role: member.role } });
});

appApiRoutes.post('/api/app/logout', async (c) => {
	await endBearerSession(c);
	return c.json({ ok: true });
});

const taskJson = (t: TaskRow, appUrl: string) => ({
	id: String(t.id),
	board: false,
	title: t.title,
	details: t.details,
	due_date: t.due_date,
	status: t.status,
	completed_at: t.completed_at,
	urgent: !!t.urgent,
	team: t.team_name,
	meeting: t.meeting_title,
	assigned_by: t.assigner_name,
	url: `${appUrl}/tasks/${t.id}`
});

/** A team-board task shared with this person. Its id starts with "board-" so it can't clash with a task's. */
const BOARD_PREFIX = 'board-';
const boardJson = (b: BoardTask, appUrl: string) => ({
	id: BOARD_PREFIX + b.id,
	board: true,
	title: b.title,
	details: b.details,
	due_date: b.due_date,
	status: b.status,
	completed_at: null,
	urgent: false,
	team: b.team_name,
	meeting: null,
	assigned_by: null,
	url: appUrl + boardTaskHref(b.id)
});

const meetingJson = (m: MeetingRow, appUrl: string) => ({
	id: m.id,
	kind: m.kind,
	title: m.title,
	date: m.date,
	time: m.time,
	end_time: m.end_time,
	location: m.location,
	doc_url: m.doc_url,
	agenda: m.agenda,
	teams: meetingTeams(m).map((t) => t.name),
	host: m.host_name ?? null,
	url: `${appUrl}/meetings/${m.id}`
});

/**
 * Meetings someone is expected at, the way the hub's emails pick them: their teams' meetings
 * (every exec for an exec-team one) unless they're skipped, ones they're invited to, and every
 * club event.
 */
const MY_MEETINGS = `${MEETING_SELECT}
	WHERE m.date BETWEEN ?2 AND ?3 AND (
		m.kind = 'event'
		OR m.id IN (SELECT meeting_id FROM meeting_invites WHERE member_id = ?1)
		OR (m.id NOT IN (SELECT meeting_id FROM meeting_skips WHERE member_id = ?1) AND (
			m.id IN (SELECT me.meeting_id FROM meeting_teams me JOIN team_members xe ON xe.team_id = me.team_id WHERE xe.member_id = ?1)
			OR (?4 = 'exec' AND m.id IN (SELECT me.meeting_id FROM meeting_teams me JOIN teams te ON te.id = me.team_id WHERE te.kind = 'exec'))
		))
	)
	ORDER BY m.date, m.time, m.id`;

appApiRoutes.get('/api/app/me', async (c) => {
	const member = await bearerMember(c);
	if (!member) return c.json({ error: 'Sign in again.' }, 401);
	const today = todayIn(c.env.TIMEZONE);
	const since = addDays(today, -PAST_DAYS);
	const [tasks, board, meetings] = await Promise.all([
		all<TaskRow>(
			c.env.DB,
			`${TASK_SELECT} WHERE t.assignee_id = ?1 AND (t.status = 'open' OR (t.status = 'done' AND t.completed_at >= ?2)) ORDER BY t.status = 'done', t.due_date, t.id`,
			member.id,
			since
		),
		boardTasks(c.env.DB, member.id, { assignee: member.id, openOrDoneSince: since }),
		all<MeetingRow>(c.env.DB, MY_MEETINGS, member.id, since, addDays(today, AHEAD_DAYS), member.role)
	]);
	return c.json({
		member: { id: member.id, name: member.name, email: member.email, role: member.role },
		today,
		timezone: c.env.TIMEZONE,
		app_url: c.env.APP_URL,
		tasks: [...tasks.map((t) => taskJson(t, c.env.APP_URL)), ...board.filter((b) => b.status !== 'dropped').map((b) => boardJson(b, c.env.APP_URL))]
			.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.due_date.localeCompare(b.due_date)),
		meetings: meetings.map((m) => meetingJson(m, c.env.APP_URL))
	});
});

// Checked off (or back on) in the app or in Apple Reminders.
appApiRoutes.post('/api/app/tasks/:id/status', async (c) => {
	const member = await bearerMember(c);
	if (!member) return c.json({ error: 'Sign in again.' }, 401);
	const v = await loadViewer(c.env.DB, member);
	const status = str((await body(c)).status);
	if (status !== 'done' && status !== 'open') return c.json({ error: 'Say done or open.' }, 400);
	const raw = c.req.param('id');
	if (raw.startsWith(BOARD_PREFIX)) return setBoardStatus(c, v, raw.slice(BOARD_PREFIX.length), status);
	const id = Number(raw);
	const task = Number.isInteger(id) ? await taskById(c.env.DB, id) : null;
	if (!task || !canCompleteTask(v, task)) return c.json({ error: 'Not your task.' }, 404);
	// A dropped task stays dropped.
	if (task.status === 'dropped') return c.json({ error: 'This task was dropped.' }, 409);
	if (task.status !== status) await setTaskStatus(c.env.DB, task.id, status, v.id, 'From the iPhone app');
	const now = await taskById(c.env.DB, task.id);
	return c.json({ task: now ? taskJson(now, c.env.APP_URL) : null });
});

/** Checks off (or reopens) a team-board task for everyone on it, the way moving it on the board does. */
async function setBoardStatus(c: Context<AppEnv>, v: Viewer, id: string, status: 'done' | 'open') {
	const db = c.env.DB;
	const task = await boardTask(db, v.id, id);
	if (!task || (!isExec(v) && !task.is_mine)) return c.json({ error: 'Not your task.' }, 404);
	if (task.status === 'dropped') return c.json({ error: 'This task was dropped.' }, 409);
	// Reopening something in progress leaves it in progress.
	const next = status === 'done' ? 'done' : task.status === 'done' ? 'open' : task.status;
	if (next !== task.status) {
		const label = BOARD_STATUSES.find(([key]) => key === next)?.[1] ?? next;
		await db.batch([
			db.prepare('UPDATE board_tasks SET status = ?1, version = version + 1 WHERE id = ?2 AND version = ?3').bind(next, task.id, task.version),
			boardLog(db, task.id, v.id, 'moved', label, true)
		]);
	}
	const now = await boardTask(db, v.id, task.id);
	return c.json({ task: now ? boardJson(now, c.env.APP_URL) : null });
}
