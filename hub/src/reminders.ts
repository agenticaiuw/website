import { signDoneLink } from './auth';
import { boardTaskHref, type BoardTask } from './board';
import { addDays, daysBetween, hourIn, todayIn, weekday } from './dates';
import { all, first, getMeta, logTask, MEETING_EXPECTED, MEETING_SELECT, MEETING_TEAMS_JSON, meetingTeams, setMeta, TASK_SELECT, teamNames } from './db';
import { assignedEmail, canceledEmail, digestEmail, dueChangedEmail, taskNoticeEmail, meetingEmail, reminderEmail, teamAddedEmail, urgentEmail, type DigestData, type EmailTask, type MeetingChanges, type ReminderGroups } from './emails';
import { sendMail, sendMails } from './mail';
import { EVENING_HOUR, meetingReminderAt, reminderFor, SEND_HOUR, shouldEscalate, SOON_DAYS, urgentReminderFor, type ReminderKind } from './schedule';
import type { Env, Member, MeetingRow, TaskRow, Team } from './types';

export { DAILY_OVERDUE_FOR, ESCALATE_AFTER, SOON_DAYS } from './schedule';

const taskUrl = (env: Env, id: number) => `${env.APP_URL}/tasks/${id}`;

async function emailTask(env: Env, t: TaskRow, opts: { withDone?: boolean; withAssignee?: boolean } = {}): Promise<EmailTask> {
	return {
		id: t.id,
		title: t.title,
		due_date: t.due_date,
		team_name: t.team_name,
		meeting_title: t.meeting_title,
		assignee_name: opts.withAssignee ? t.assignee_name : undefined,
		url: taskUrl(env, t.id),
		doneUrl: opts.withDone ? `${env.APP_URL}/done?t=${await signDoneLink(env, t.id, t.assignee_id)}` : undefined
	};
}

type ReminderRow = TaskRow & { assignee_active: number; assigner_email: string | null; assigner_active: number | null };
type BoardReminder = {
	task_id: string; member_id: number; name: string; email: string; title: string; due_date: string;
	team_name: string; last_reminder_on: string | null;
};

export async function runDailyReminders(env: Env, now = new Date()) {
	const today = todayIn(env.TIMEZONE, now);
	const [tasks, board] = await Promise.all([all<ReminderRow>(
		env.DB,
		TASK_SELECT.replace('b.name AS assigner_name', 'b.name AS assigner_name, b.email AS assigner_email, b.active AS assigner_active, a.active AS assignee_active') +
			` WHERE t.status = 'open' AND t.due_date <= ? ORDER BY t.due_date, t.id`,
		addDays(today, SOON_DAYS)
	), all<BoardReminder>(env.DB, `SELECT t.id AS task_id, m.id AS member_id, m.name, m.email, t.title, t.due_date,
		tm.name AS team_name, n.last_reminder_on
		FROM board_tasks t JOIN teams tm ON tm.id = t.team_id
		JOIN board_task_recipients r ON r.task_id = t.id JOIN members m ON m.id = r.member_id
		LEFT JOIN board_task_reminders n ON n.task_id = t.id AND n.member_id = m.id
		WHERE t.status IN ('open', 'in_progress') AND m.active = 1 AND t.due_date <= ?
		ORDER BY t.due_date, t.id`, addDays(today, SOON_DAYS))]);

	type Bucket = { name: string; email: string; groups: ReminderGroups; reminded: { id: number; kind: ReminderKind }[]; escalated: ReminderRow[]; board: { task: BoardReminder; kind: ReminderKind }[] };
	const buckets = new Map<number, Bucket>();
	const bucket = (id: number, name: string, email: string) => {
		let b = buckets.get(id);
		if (!b) buckets.set(id, (b = { name, email, groups: { overdue: [], today: [], soon: [], followUp: [] }, reminded: [], escalated: [], board: [] }));
		return b;
	};

	for (const t of tasks) {
		const kind = t.assignee_active ? reminderFor(t.due_date, t.last_reminder_on, today) : null;
		if (kind) {
			const b = bucket(t.assignee_id, t.assignee_name, t.assignee_email);
			b.groups[kind].push(await emailTask(env, t, { withDone: true }));
			b.reminded.push({ id: t.id, kind });
		}
		if (shouldEscalate(t, today) && t.assigner_active && t.assigner_email) {
			const b = bucket(t.assigned_by!, t.assigner_name ?? '', t.assigner_email);
			b.groups.followUp.push(await emailTask(env, t, { withAssignee: true }));
			b.escalated.push(t);
		}
	}
	for (const task of board) {
		const kind = reminderFor(task.due_date, task.last_reminder_on, today);
		if (kind) bucket(task.member_id, task.name, task.email).board.push({ task, kind });
	}

	let sent = 0;
	let failed = 0;
	for (const b of buckets.values()) {
		const claims = b.board.length ? await env.DB.batch(b.board.map(({ task }) =>
			env.DB.prepare(`INSERT INTO board_task_reminders (task_id, member_id, last_reminder_on)
			 SELECT ?1, ?2, ?3 FROM board_tasks t JOIN board_task_recipients r ON r.task_id = t.id
			 JOIN members m ON m.id = r.member_id
			 WHERE t.id = ?1 AND m.id = ?2 AND m.active = 1 AND t.status IN ('open', 'in_progress') AND t.due_date = ?4
			 ON CONFLICT(task_id, member_id) DO UPDATE SET last_reminder_on = excluded.last_reminder_on
			 WHERE board_task_reminders.last_reminder_on IS ?5`)
				.bind(task.task_id, task.member_id, today, task.due_date, task.last_reminder_on))) : [];
		const claimed = b.board.filter((_, i) => claims[i].meta.changes > 0);
		for (const { task, kind } of claimed) {
			b.groups[kind].push({
				id: task.task_id, title: task.title, due_date: task.due_date, team_name: task.team_name, meeting_title: null,
				url: env.APP_URL + boardTaskHref(task.task_id)
			});
		}
		if (!claimed.length && !b.reminded.length && !b.escalated.length) continue;
		const msg = reminderEmail(b.name, b.groups, today, env.APP_URL);
		const res = await sendMail(env, { to: { name: b.name, email: b.email }, kind: 'reminder', ...msg });
		if (!res.ok) {
			failed++;
			if (claimed.length) await env.DB.batch(claimed.map(({ task }) => task.last_reminder_on === null
				? env.DB.prepare('DELETE FROM board_task_reminders WHERE task_id = ? AND member_id = ? AND last_reminder_on = ?')
					.bind(task.task_id, task.member_id, today)
				: env.DB.prepare('UPDATE board_task_reminders SET last_reminder_on = ? WHERE task_id = ? AND member_id = ? AND last_reminder_on = ?')
					.bind(task.last_reminder_on, task.task_id, task.member_id, today)));
			continue; // nothing is marked, so the next run tries again
		}
		sent++;
		const label = { overdue: 'Overdue reminder emailed', today: 'Due-today reminder emailed', soon: 'Due-soon reminder emailed' };
		if (b.reminded.length || b.escalated.length) await env.DB.batch([
			...b.reminded.flatMap((r) => [
				env.DB.prepare('UPDATE tasks SET last_reminder_on = ?, reminded_at = ?, reminders_sent = reminders_sent + 1 WHERE id = ?').bind(today, now.toISOString(), r.id),
				logTask(env.DB, r.id, null, 'reminder', label[r.kind])
			]),
			...b.escalated.flatMap((t) => [
				env.DB.prepare('UPDATE tasks SET escalated_on = ? WHERE id = ?').bind(today, t.id),
				logTask(env.DB, t.id, null, 'escalated', `${t.assigner_name} was emailed that this is ${daysBetween(t.due_date, today)} days overdue`)
			])
		]);
	}
	return { today, sent, failed };
}

/** Every hour: one email per person listing their urgent tasks that are due a reminder now. */
export async function runUrgentReminders(env: Env, now = new Date()) {
	const today = todayIn(env.TIMEZONE, now);
	const hour = hourIn(env.TIMEZONE, now);
	const tasks = await all<TaskRow & { assignee_active: number }>(
		env.DB,
		TASK_SELECT.replace('b.name AS assigner_name', 'b.name AS assigner_name, a.active AS assignee_active') +
			` WHERE t.status = 'open' AND t.urgent = 1 AND t.due_date <= ? ORDER BY t.due_date, t.id`,
		today
	);
	const byPerson = new Map<number, { name: string; email: string; tonight: EmailTask[]; overdue: EmailTask[]; ids: number[] }>();
	for (const t of tasks) {
		const kind = t.assignee_active ? urgentReminderFor(t, now, today, hour) : null;
		if (!kind) continue;
		let b = byPerson.get(t.assignee_id);
		if (!b) byPerson.set(t.assignee_id, (b = { name: t.assignee_name, email: t.assignee_email, tonight: [], overdue: [], ids: [] }));
		b[kind].push(await emailTask(env, t, { withDone: true }));
		b.ids.push(t.id);
	}
	let sent = 0;
	let failed = 0;
	for (const b of byPerson.values()) {
		const msg = urgentEmail(b.name, b.tonight, b.overdue, today, env.APP_URL);
		const res = await sendMail(env, { to: { name: b.name, email: b.email }, kind: 'reminder', ...msg });
		if (!res.ok) {
			failed++;
			continue; // nothing is marked, so the next run tries again
		}
		sent++;
		await env.DB.batch(
			b.ids.flatMap((id) => [
				env.DB.prepare('UPDATE tasks SET last_reminder_on = ?, reminded_at = ?, reminders_sent = reminders_sent + 1 WHERE id = ?').bind(today, now.toISOString(), id),
				logTask(env.DB, id, null, 'reminder', 'Urgent reminder emailed')
			])
		);
	}
	return { sent, failed };
}

export async function sendExecDigest(env: Env, now = new Date()) {
	const today = todayIn(env.TIMEZONE, now);
	const open = await all<TaskRow>(env.DB, `${TASK_SELECT} WHERE t.status = 'open' AND t.due_date < ? ORDER BY a.name COLLATE NOCASE, t.due_date`, addDays(today, 7));
	const overdueByPerson: DigestData['overdueByPerson'] = [];
	const dueThisWeek: EmailTask[] = [];
	for (const t of open) {
		if (t.due_date < today) {
			let p = overdueByPerson.find((x) => x.name === t.assignee_name);
			if (!p) overdueByPerson.push((p = { name: t.assignee_name, tasks: [] }));
			p.tasks.push(await emailTask(env, t));
		} else {
			dueThisWeek.push(await emailTask(env, t, { withAssignee: true }));
		}
	}
	dueThisWeek.sort((a, b) => a.due_date.localeCompare(b.due_date));
	const done = await first<{ n: number }>(env.DB, "SELECT COUNT(*) AS n FROM tasks WHERE status = 'done' AND completed_at >= ?", new Date(now.getTime() - 7 * 86_400_000).toISOString());
	const meetings = await all<Pick<MeetingRow, 'id' | 'title' | 'team_id' | 'team_name' | 'team_kind' | 'teams_json' | 'date' | 'time' | 'end_time'> & { present: number; total: number }>(
		env.DB,
		`SELECT m.id, m.title, m.date, m.time, m.end_time, m.team_id, tm.name AS team_name, tm.kind AS team_kind, ${MEETING_TEAMS_JSON},
			(SELECT COUNT(*) FROM attendance x WHERE x.meeting_id = m.id AND x.status IN ('present', 'late')) AS present,
			(SELECT COUNT(*) FROM attendance x WHERE x.meeting_id = m.id) AS total
		 FROM meetings m JOIN teams tm ON tm.id = m.team_id
		 WHERE m.date >= ? AND m.date < ? ORDER BY m.date, m.time`,
		addDays(today, -7),
		today
	);
	const data: DigestData = {
		overdueByPerson,
		dueThisWeek,
		doneLastWeek: done?.n ?? 0,
		meetings: meetings.map((m) => ({ ...m, team_name: teamNames(m), url: `${env.APP_URL}/meetings/${m.id}` }))
	};
	const execs = await all<Member>(env.DB, "SELECT * FROM members WHERE role = 'exec' AND active = 1");
	let sent = 0;
	for (const e of execs) {
		const msg = digestEmail(e.name, data, today, env.APP_URL);
		if ((await sendMail(env, { to: { name: e.name, email: e.email }, kind: 'digest', ...msg })).ok) sent++;
	}
	await setMeta(env.DB, 'last_digest_on', today);
	return { sent };
}

/**
 * Who a meeting's emails go to: everyone on its teams (every exec, if one is the exec team) and
 * anyone invited, or the whole club for a club event.
 */
export function meetingPeople(db: D1Database, m: Pick<MeetingRow, 'id' | 'kind'>) {
	return all<Member>(
		db,
		`SELECT * FROM members mb WHERE mb.active = 1 AND (?2 = 'event' OR ${MEETING_EXPECTED})
		 ORDER BY mb.name COLLATE NOCASE`,
		m.id,
		m.kind
	);
}

/** A meeting in the shape meetingEmail wants. */
export const emailMeeting = (m: MeetingRow) => ({ ...m, team_names: meetingTeams(m).map((t) => t.name) });

/**
 * One BCC email about a meeting: `new` when it's scheduled, `changed` when its date, time or place
 * moves, `added` to people newly put on it. `only` limits it to those people (default: everyone on it).
 */
export async function announceMeeting(env: Env, m: MeetingRow, opts: { mode?: 'new' | 'changed' | 'added'; changes?: MeetingChanges; repeats?: string; only?: number[]; why?: { reason: string; by: string } } = {}) {
	const mode = opts.mode ?? 'new';
	const people = (await meetingPeople(env.DB, m)).filter((p) => !opts.only || opts.only.includes(p.id));
	if (!people.length) return { sent: 0, error: '' };
	const changed = mode === 'changed' ? (opts.changes ?? {}) : undefined;
	const msg = meetingEmail(null, emailMeeting(m), todayIn(env.TIMEZONE), env.APP_URL, { announce: true, changed, added: mode === 'added', repeats: opts.repeats, why: opts.why });
	const res = await sendMail(env, {
		to: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
		bcc: people.map((p) => ({ name: p.name, email: p.email })),
		kind: `meeting-${mode}`,
		...msg
	});
	return res.ok ? { sent: people.length, error: '' } : { sent: 0, error: res.error ?? 'failed' };
}

export async function sendMeetingReminders(env: Env, now = new Date()) {
	const today = todayIn(env.TIMEZONE, now);
	const hour = hourIn(env.TIMEZONE, now);
	const due = (
		await all<MeetingRow>(env.DB, `${MEETING_SELECT} WHERE m.date IN (?1, ?2) AND m.reminded_on IS NOT ?1 ORDER BY m.date, m.time`, today, addDays(today, 1))
	).filter((m) => {
		const at = meetingReminderAt(m);
		return at.date === today && at.hour === hour;
	});
	let sent = 0;
	let failed = 0;
	for (const m of due) {
		// Claim it before sending so an overlapping run can't email everyone twice.
		const claim = await env.DB.prepare('UPDATE meetings SET reminded_on = ?1 WHERE id = ?2 AND reminded_on IS NOT ?1').bind(today, m.id).run();
		if (!claim.meta.changes) continue;
		const people = await meetingPeople(env.DB, m);
		const results = await sendMails(
			env,
			people.map((p) => ({ to: { name: p.name, email: p.email }, kind: 'meeting', ...meetingEmail(p.name, emailMeeting(m), today, env.APP_URL) }))
		);
		sent += results.filter((r) => r.ok).length;
		failed += results.filter((r) => !r.ok).length;
	}
	return { sent, failed };
}

/**
 * Repeating tasks: on each one's due date, the next one is made for everyone still on it (not anyone
 * who dropped theirs) and they're emailed about it, like any new task. Stops after repeat_until.
 * Daily tasks are made as soon as their day starts instead (`dailyOnly`: the hourly runs), with no
 * separate email: the 9 AM reminder lists them under today, so nobody gets two emails a day for one
 * task, and checking off yesterday's late never leaves today without one.
 */
export async function makeRepeatingTasks(env: Env, today: string, dailyOnly = false) {
	const db = env.DB;
	const due = await all<TaskRow>(
		db,
		`${TASK_SELECT} WHERE t.repeat_days > 0 AND t.repeated = 0 AND (t.due_date < ?1 OR (t.repeat_days > 1 AND t.due_date = ?1))${dailyOnly ? ' AND t.repeat_days = 1' : ''} ORDER BY t.id`,
		today
	);
	const groups = new Map<number, TaskRow[]>();
	for (const t of due) groups.set(t.group_id ?? t.id, [...(groups.get(t.group_id ?? t.id) ?? []), t]);
	let made = 0;
	for (const copies of groups.values()) {
		const t = copies[0];
		await db.prepare('UPDATE tasks SET repeated = 1 WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(copies.map((o) => o.id))).run();
		// The next date after today (daily: today), in case a run was missed.
		const daily = t.repeat_days === 1;
		let next = addDays(t.due_date, t.repeat_days);
		while (daily ? next < today : next <= today) next = addDays(next, t.repeat_days);
		if (t.repeat_until && next > t.repeat_until) continue;
		const ids: number[] = [];
		for (const o of copies) {
			if (o.status === 'dropped') continue;
			const res = await db
				.prepare(
					`INSERT INTO tasks (title, details, assignee_id, assigned_by, team_id, meeting_id, due_date, urgent, repeat_days, repeat_until)
					 SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ? FROM members WHERE id = ? AND active = 1`
				)
				.bind(o.title, o.details, o.assigned_by, o.team_id, o.meeting_id, next, o.urgent, o.repeat_days, o.repeat_until, o.assignee_id)
				.run();
			if (!res.meta.changes) continue;
			const id = Number(res.meta.last_row_id);
			ids.push(id);
			await logTask(db, id, null, 'created', `Repeats ${daily ? 'daily' : t.repeat_days === 14 ? 'every 2 weeks' : 'weekly'}: the one after ${o.due_date}`).run();
		}
		if (!ids.length) continue;
		if (ids.length > 1) await db.prepare('UPDATE tasks SET group_id = ? WHERE id IN (SELECT value FROM json_each(?))').bind(ids[0], JSON.stringify(ids)).run();
		made += ids.length;
		if (daily) continue;
		await notifyAssigned(env, { id: t.assigned_by ?? 0, name: t.assigner_name ?? 'The club hub' }, ids);
	}
	return made;
}

/**
 * The cron entry point. Runs every hour. Task reminders go out at 9 AM club time, plus the exec
 * digest on Mondays; urgent tasks are checked every hour; meeting reminders at 9 AM and 6 PM.
 */
export async function scheduled(env: Env, now = new Date()) {
	const hour = hourIn(env.TIMEZONE, now);
	const today = todayIn(env.TIMEZONE, now);
	// Daily copies every hour (so today's exists from midnight), the rest at 9 AM with their email.
	const repeats = await makeRepeatingTasks(env, today, hour !== SEND_HOUR);
	if (repeats) console.log(`[repeats] ${today} ${hour}:00: ${repeats} made`);
	if (hour === SEND_HOUR) {
		const result = await runDailyReminders(env, now);
		console.log(`[reminders] ${today}: ${result.sent} sent, ${result.failed} failed`);
		if (weekday(today) === 1 && (await getMeta(env.DB, 'last_digest_on')) !== today) {
			const digest = await sendExecDigest(env, now);
			console.log(`[digest] sent to ${digest.sent} execs`);
		}
	}
	// After the daily run, so a task it just covered isn't emailed twice this hour.
	const urgent = await runUrgentReminders(env, now);
	if (urgent.sent || urgent.failed) console.log(`[urgent] ${today} ${hour}:00: ${urgent.sent} sent, ${urgent.failed} failed`);
	if (hour !== SEND_HOUR && hour !== EVENING_HOUR) return;
	const meetings = await sendMeetingReminders(env, now);
	console.log(`[meetings] ${today} ${hour}:00: ${meetings.sent} sent, ${meetings.failed} failed`);
}

/** Emails each assignee once about the tasks just given to them (not ones they gave themselves). */
export async function notifyAssigned(env: Env, assigner: { id: number; name: string }, taskIds: number[]) {
	if (!taskIds.length) return 0;
	const today = todayIn(env.TIMEZONE);
	const rows = await all<TaskRow & { assignee_active: number }>(
		env.DB,
		TASK_SELECT.replace('b.name AS assigner_name', 'b.name AS assigner_name, a.active AS assignee_active') +
			` WHERE t.id IN (${taskIds.map(() => '?').join(',')}) ORDER BY t.due_date`,
		...taskIds
	);
	const byPerson = new Map<number, (TaskRow & { assignee_active: number })[]>();
	for (const t of rows) {
		if (!t.assignee_active) continue;
		byPerson.set(t.assignee_id, [...(byPerson.get(t.assignee_id) ?? []), t]);
	}
	let sent = 0;
	for (const list of byPerson.values()) {
		const items = await Promise.all(list.map((t) => emailTask(env, t, { withDone: true })));
		const msg = assignedEmail(list[0].assignee_name, list[0].assignee_id === assigner.id ? null : assigner.name, items, today, env.APP_URL);
		const res = await sendMail(env, { to: { name: list[0].assignee_name, email: list[0].assignee_email }, kind: 'assigned', ...msg });
		if (res.ok) sent++;
		await env.DB.batch(list.map((t) => logTask(env.DB, t.id, null, 'notified', res.ok ? `Assignment emailed to ${t.assignee_name}` : `Assignment email failed: ${res.error}`)));
	}
	return sent;
}

/** Emails people newly responsible for a team board card (named, or through a subteam), except whoever did it. */
export async function notifyBoardAssigned(env: Env, assigner: { id: number; name: string }, task: Pick<BoardTask, 'id' | 'title' | 'due_date' | 'team_name'>, before: Set<number> = new Set()) {
	const today = todayIn(env.TIMEZONE);
	const people = await all<Pick<Member, 'id' | 'name' | 'email'>>(
		env.DB,
		'SELECT DISTINCT m.id, m.name, m.email FROM board_task_recipients r JOIN members m ON m.id = r.member_id WHERE r.task_id = ? AND m.active = 1',
		task.id
	);
	const item: EmailTask = { id: task.id, title: task.title, due_date: task.due_date, team_name: task.team_name, meeting_title: null, url: env.APP_URL + boardTaskHref(task.id) };
	let sent = 0;
	for (const m of people) {
		if (m.id === assigner.id || before.has(m.id)) continue;
		const res = await sendMail(env, { to: { name: m.name, email: m.email }, kind: 'assigned', ...assignedEmail(m.name, assigner.name, [item], today, env.APP_URL) });
		if (res.ok) sent++;
	}
	return sent;
}

/** Tells everyone on these tasks (except whoever made the change) that the due date moved from `oldDue`. */
export async function notifyDueChanged(env: Env, changer: { id: number; name: string }, taskIds: number[], oldDue: Map<number, string>) {
	if (!taskIds.length) return 0;
	const today = todayIn(env.TIMEZONE);
	const rows = await all<TaskRow & { assignee_active: number }>(
		env.DB,
		TASK_SELECT.replace('b.name AS assigner_name', 'b.name AS assigner_name, a.active AS assignee_active') + ` WHERE t.id IN (${taskIds.map(() => '?').join(',')})`,
		...taskIds
	);
	let sent = 0;
	for (const t of rows) {
		if (!t.assignee_active || t.assignee_id === changer.id || t.status !== 'open') continue;
		const msg = dueChangedEmail(t.assignee_name, changer.name, await emailTask(env, t, { withDone: true }), oldDue.get(t.id) ?? t.due_date, today, env.APP_URL);
		const res = await sendMail(env, { to: { name: t.assignee_name, email: t.assignee_email }, kind: 'due-changed', ...msg });
		if (res.ok) sent++;
		await logTask(env.DB, t.id, null, 'notified', res.ok ? `New due date emailed to ${t.assignee_name}` : `Due date email failed: ${res.error}`).run();
	}
	return sent;
}

/**
 * Tells people their task was dropped, or that they were taken off it (`removed`: the copy is
 * already deleted, so there's no link). Skips whoever made the change.
 */
export async function notifyTaskEnded(env: Env, changer: { id: number; name: string }, tasks: TaskRow[], how: 'dropped' | 'removed') {
	const today = todayIn(env.TIMEZONE);
	let sent = 0;
	for (const t of tasks) {
		if (t.assignee_id === changer.id || t.status !== 'open') continue;
		const line = how === 'dropped' ? `${changer.name} dropped this task, so it’s not happening and its reminders have stopped.` : `${changer.name} took you off this task. You won’t get more reminders for it.`;
		const msg = taskNoticeEmail(t.assignee_name, how === 'dropped' ? `Dropped: ${t.title}` : `You’re off: ${t.title}`, line, await emailTask(env, t), today, env.APP_URL, how === 'dropped');
		const res = await sendMail(env, { to: { name: t.assignee_name, email: t.assignee_email }, kind: `task-${how}`, ...msg });
		if (res.ok) sent++;
		if (how === 'dropped') await logTask(env.DB, t.id, null, 'notified', res.ok ? `Drop emailed to ${t.assignee_name}` : `Drop email failed: ${res.error}`).run();
	}
	return sent;
}

/** One BCC email to `people` saying the meeting (and `later` dates of its series) is canceled. */
export async function announceCanceled(env: Env, m: MeetingRow, people: Member[], later: string[], why: { reason: string; by: string }) {
	if (!people.length) return { sent: 0, error: '' };
	const res = await sendMail(env, {
		to: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
		bcc: people.map((p) => ({ name: p.name, email: p.email })),
		kind: 'meeting-canceled',
		...canceledEmail(emailMeeting(m), todayIn(env.TIMEZONE), env.APP_URL, later, why)
	});
	return res.ok ? { sent: people.length, error: '' } : { sent: 0, error: res.error ?? 'failed' };
}

/**
 * Tells each of a meeting's hosts they're hosting it, except whoever set them and anyone in
 * `before` (its hosts until now).
 */
export async function notifyHost(env: Env, m: MeetingRow, setBy: number, before: (number | null)[] = []) {
	const hosts = [m.host_id, m.cohost_id].filter((x): x is number => !!x);
	for (const hostId of hosts) {
		if (hostId === setBy || before.includes(hostId)) continue;
		const host = await first<Member>(env.DB, 'SELECT * FROM members WHERE id = ? AND active = 1', hostId);
		if (!host) continue;
		const otherId = hosts.find((x) => x !== hostId);
		const cohost = otherId ? (await first<Pick<Member, 'name'>>(env.DB, 'SELECT name FROM members WHERE id = ?', otherId))?.name : undefined;
		const msg = meetingEmail(host.name, emailMeeting(m), todayIn(env.TIMEZONE), env.APP_URL, { hosting: true, cohost });
		await sendMail(env, { to: { name: host.name, email: host.email }, kind: 'meeting-host', ...msg });
	}
}

/** Tells someone they're on a team now, with the team's upcoming meetings they're on (skipped when they added themselves). */
export async function notifyTeamAdded(env: Env, by: { id: number; name: string }, teamId: number, memberId: number) {
	if (memberId === by.id) return;
	const [member, team] = await Promise.all([
		first<Member & { signed_in: number }>(env.DB, 'SELECT *, EXISTS (SELECT 1 FROM sessions s WHERE s.member_id = members.id) AS signed_in FROM members WHERE id = ? AND active = 1', memberId),
		first<Pick<Team, 'id' | 'name'>>(env.DB, 'SELECT id, name FROM teams WHERE id = ? AND archived = 0', teamId)
	]);
	if (!member || !team) return;
	const today = todayIn(env.TIMEZONE);
	const meetings = await all<MeetingRow>(
		env.DB,
		`${MEETING_SELECT} WHERE m.date >= ?1 AND m.id IN (SELECT meeting_id FROM meeting_teams WHERE team_id = ?2)
		 AND EXISTS (SELECT 1 FROM members mb WHERE mb.id = ?3 AND ${MEETING_EXPECTED.replace(/\?1/g, 'm.id')})
		 ORDER BY m.date, m.time`,
		today,
		teamId,
		memberId
	);
	const msg = teamAddedEmail(member, team, by.name, meetings.map(emailMeeting), today, env.APP_URL, !member.signed_in);
	await sendMail(env, { to: { name: member.name, email: member.email }, kind: 'team-added', ...msg });
}
