import { signDoneLink } from './auth';
import { addDays, daysBetween, hourIn, todayIn, weekday } from './dates';
import { all, first, getMeta, logTask, MEETING_EXPECTED, MEETING_SELECT, MEETING_TEAMS_JSON, meetingTeams, setMeta, TASK_SELECT, teamNames } from './db';
import { assignedEmail, canceledEmail, digestEmail, dueChangedEmail, taskNoticeEmail, meetingEmail, reminderEmail, urgentEmail, type DigestData, type EmailTask, type ReminderGroups } from './emails';
import { sendMail, sendMails } from './mail';
import { EVENING_HOUR, meetingReminderAt, reminderFor, SEND_HOUR, shouldEscalate, SOON_DAYS, urgentReminderFor, type ReminderKind } from './schedule';
import type { Env, Member, MeetingRow, TaskRow } from './types';

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

export async function runDailyReminders(env: Env, now = new Date()) {
	const today = todayIn(env.TIMEZONE, now);
	const tasks = await all<ReminderRow>(
		env.DB,
		TASK_SELECT.replace('b.name AS assigner_name', 'b.name AS assigner_name, b.email AS assigner_email, b.active AS assigner_active, a.active AS assignee_active') +
			` WHERE t.status = 'open' AND t.due_date <= ? ORDER BY t.due_date, t.id`,
		addDays(today, SOON_DAYS)
	);

	type Bucket = { name: string; email: string; groups: ReminderGroups; reminded: { id: number; kind: ReminderKind }[]; escalated: ReminderRow[] };
	const buckets = new Map<number, Bucket>();
	const bucket = (id: number, name: string, email: string) => {
		let b = buckets.get(id);
		if (!b) buckets.set(id, (b = { name, email, groups: { overdue: [], today: [], soon: [], followUp: [] }, reminded: [], escalated: [] }));
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

	let sent = 0;
	let failed = 0;
	for (const b of buckets.values()) {
		const msg = reminderEmail(b.name, b.groups, today, env.APP_URL);
		const res = await sendMail(env, { to: { name: b.name, email: b.email }, kind: 'reminder', ...msg });
		if (!res.ok) {
			failed++;
			continue; // nothing is marked, so the next run tries again
		}
		sent++;
		const label = { overdue: 'Overdue reminder emailed', today: 'Due-today reminder emailed', soon: 'Due-soon reminder emailed' };
		await env.DB.batch([
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
export async function announceMeeting(env: Env, m: MeetingRow, opts: { mode?: 'new' | 'changed' | 'added'; repeats?: string; only?: number[] } = {}) {
	const mode = opts.mode ?? 'new';
	const people = (await meetingPeople(env.DB, m)).filter((p) => !opts.only || opts.only.includes(p.id));
	if (!people.length) return { sent: 0, error: '' };
	const msg = meetingEmail(null, emailMeeting(m), todayIn(env.TIMEZONE), env.APP_URL, { announce: true, changed: mode === 'changed', added: mode === 'added', repeats: opts.repeats });
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
 * The cron entry point. Runs every hour. Task reminders go out at 9 AM club time, plus the exec
 * digest on Mondays; urgent tasks are checked every hour; meeting reminders at 9 AM and 6 PM.
 */
export async function scheduled(env: Env, now = new Date()) {
	const hour = hourIn(env.TIMEZONE, now);
	const today = todayIn(env.TIMEZONE, now);
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

/** Tells someone they're now hosting a meeting (skipped when they set it themselves). */
export async function notifyHost(env: Env, m: MeetingRow, setBy: number) {
	if (!m.host_id || m.host_id === setBy) return;
	const host = await first<Member>(env.DB, 'SELECT * FROM members WHERE id = ? AND active = 1', m.host_id);
	if (!host) return;
	const msg = meetingEmail(host.name, emailMeeting(m), todayIn(env.TIMEZONE), env.APP_URL, { hosting: true });
	await sendMail(env, { to: { name: host.name, email: host.email }, kind: 'meeting-host', ...msg });
}
