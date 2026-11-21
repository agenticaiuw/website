// The reminder policy, kept free of I/O so it reads in one place and runs under `npm test`.

import { addDays, clubTime, daysBetween, isTime } from '../dates.ts';

export const SOON_DAYS = 1; // one heads-up the day before a task with no time is due
export const ESCALATE_AFTER = 3; // days overdue before whoever assigned it hears about it
export const DAILY_OVERDUE_FOR = 3; // overdue reminders go out daily this long, then every 3 days
export const SEND_HOUR = 9; // club time
const SEND_TIME = '09:00';
export const URGENT_FROM_HOUR = 19; // club time; urgent tasks start getting reminders this evening of the due date
export const URGENT_EVERY_HOURS = 2;
export const QUIET_FROM_HOUR = 1; // club time; no urgent reminders from 1 AM…
export const QUIET_UNTIL_HOUR = 8; // …until 8 AM
const URGENT_SLACK_MINUTES = 15; // the hourly run lands a few seconds either side of the hour
export const MEETING_SOON_HOURS = 1; // meetings and events: a day before, then an hour before
export const TASK_SOON_HOURS = 4; // tasks with a due time: a day before, then 4 hours before
const HOUR_MS = 3_600_000;
const DAY_WINDOW_MS = 2 * HOUR_MS; // runs are every 5 minutes; this leaves room for a missed one
const SOON_WINDOW_MS = HOUR_MS / 2;

export type ReminderKind = 'overdue' | 'today' | 'soon';
export type UrgentKind = 'tonight' | 'overdue';
export type TimedKind = 'day' | 'soon';

/**
 * What, if anything, to remind the assignee about today. Works from the last reminder date
 * instead of exact day matches, so a missed or repeated daily run never skips or doubles up.
 */
export function reminderFor(due: string, lastReminderOn: string | null, today: string): ReminderKind | null {
	if (lastReminderOn === today) return null;
	const daysLeft = daysBetween(today, due);
	if (daysLeft > SOON_DAYS) return null;
	if (daysLeft > 0) {
		const alreadyWarned = lastReminderOn !== null && lastReminderOn >= addDays(due, -SOON_DAYS);
		return alreadyWarned ? null : 'soon';
	}
	if (daysLeft === 0) return 'today';
	if (lastReminderOn === null || -daysLeft <= DAILY_OVERDUE_FOR) return 'overdue';
	return daysBetween(lastReminderOn, today) >= 3 ? 'overdue' : null;
}

/**
 * Whether an urgent task gets a reminder in this hour's run (`today` and `hour` are club time):
 * from 7 PM on the due date (from its due time, `dueAt`, if it has one), then every 2 hours while
 * overdue, outside quiet hours, until `urgent_until`. Spacing counts from the last email of any
 * kind, so the 9 AM one counts too.
 */
export function urgentReminderFor(
	t: { due_date: string; urgent_until: string | null; reminded_at: string | null },
	now: Date,
	today: string,
	hour: number,
	dueAt: number | null = null
): UrgentKind | null {
	if (t.urgent_until && now.getTime() >= Date.parse(t.urgent_until)) return null;
	if (hour >= QUIET_FROM_HOUR && hour < QUIET_UNTIL_HOUR) return null;
	if (dueAt !== null ? now.getTime() < dueAt : today < t.due_date || (today === t.due_date && hour < URGENT_FROM_HOUR)) return null;
	if (t.reminded_at && now.getTime() - Date.parse(t.reminded_at) < (URGENT_EVERY_HOURS * 60 - URGENT_SLACK_MINUTES) * 60_000) return null;
	return dueAt === null && today === t.due_date ? 'tonight' : 'overdue';
}

/** What a reminded_*_for column holds: the "date time" a reminder went out for. A new date or time no longer matches, so its reminders go out again. */
export const remindKey = (x: { date: string; time: string }) => `${x.date} ${x.time}`;

/**
 * When something's two reminders go out (UTC ms), like Luma: a day before it starts or is due,
 * then `soonHours` before. Without a time: 9 AM the day before, then 9 AM the day of.
 */
export function reminderTimes(x: { date: string; time: string }, soonHours: number, timeZone: string) {
	if (!isTime(x.time)) return { day: clubTime(addDays(x.date, -1), SEND_TIME, timeZone), soon: clubTime(x.date, SEND_TIME, timeZone), start: null };
	const start = clubTime(x.date, x.time, timeZone);
	return { day: start - 24 * HOUR_MS, soon: start - soonHours * HOUR_MS, start };
}

/**
 * Which reminder is due on this run, if any. Each goes out in a short window after its time, never
 * once the next one's window opens or the thing has started, and not if it was made after that
 * time (whoever's on it was emailed when it was made).
 */
export function timedReminderFor(
	x: { date: string; time: string; created_at: string; reminded_day_for: string | null; reminded_soon_for: string | null },
	now: Date,
	soonHours: number,
	timeZone: string
): TimedKind | null {
	const t = now.getTime();
	const made = Date.parse(x.created_at);
	const key = remindKey(x);
	const at = reminderTimes(x, soonHours, timeZone);
	if (x.reminded_soon_for === key) return null;
	if (t >= at.soon) return t < Math.min(at.soon + SOON_WINDOW_MS, at.start ?? Infinity) && made < at.soon ? 'soon' : null;
	if (x.reminded_day_for === key) return null;
	return t >= at.day && t < Math.min(at.day + DAY_WINDOW_MS, at.soon) && made < at.day ? 'day' : null;
}

export function shouldEscalate(
	t: { due_date: string; escalated_on: string | null; assigned_by: number | null; assignee_id: number },
	today: string
) {
	return t.escalated_on === null && t.assigned_by !== null && t.assigned_by !== t.assignee_id && daysBetween(t.due_date, today) >= ESCALATE_AFTER;
}
