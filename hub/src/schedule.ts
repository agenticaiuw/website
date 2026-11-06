// The reminder policy, kept free of I/O so it reads in one place and runs under `npm test`.

import { addDays, daysBetween } from './dates.ts';

export const SOON_DAYS = 2; // one heads-up when a task is this many days (or fewer) away
export const ESCALATE_AFTER = 3; // days overdue before whoever assigned it hears about it
export const DAILY_OVERDUE_FOR = 3; // overdue reminders go out daily this long, then every 3 days
export const SEND_HOUR = 9; // club time
export const EVENING_HOUR = 18; // club time; reminders for the next morning's meetings
const MORNING_ENDS = '12:00'; // meetings that start before this are reminded the evening before
export const URGENT_FROM_HOUR = 19; // club time; urgent tasks start getting reminders this evening of the due date
export const URGENT_EVERY_HOURS = 2;
export const QUIET_FROM_HOUR = 1; // club time; no urgent reminders from 1 AM…
export const QUIET_UNTIL_HOUR = 8; // …until 8 AM
const URGENT_SLACK_MINUTES = 15; // the hourly run lands a few seconds either side of the hour

export type ReminderKind = 'overdue' | 'today' | 'soon';
export type UrgentKind = 'tonight' | 'overdue';

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
 * from 7 PM on the due date, then every 2 hours while overdue, outside quiet hours, until
 * `urgent_until`. Spacing counts from the last email of any kind, so the 9 AM one counts too.
 */
export function urgentReminderFor(
	t: { due_date: string; urgent_until: string | null; reminded_at: string | null },
	now: Date,
	today: string,
	hour: number
): UrgentKind | null {
	if (t.urgent_until && now.getTime() >= Date.parse(t.urgent_until)) return null;
	if (hour >= QUIET_FROM_HOUR && hour < QUIET_UNTIL_HOUR) return null;
	if (today < t.due_date || (today === t.due_date && hour < URGENT_FROM_HOUR)) return null;
	if (t.reminded_at && now.getTime() - Date.parse(t.reminded_at) < (URGENT_EVERY_HOURS * 60 - URGENT_SLACK_MINUTES) * 60_000) return null;
	return today === t.due_date ? 'tonight' : 'overdue';
}

/**
 * When a meeting's reminder goes out: 9 AM the day of, or 6 PM the evening before if it starts
 * before noon. Club events go out at 9 AM the day before.
 */
export function meetingReminderAt(m: { kind: 'meeting' | 'event'; date: string; time: string }) {
	if (m.kind === 'event') return { date: addDays(m.date, -1), hour: SEND_HOUR };
	if (m.time && m.time < MORNING_ENDS) return { date: addDays(m.date, -1), hour: EVENING_HOUR };
	return { date: m.date, hour: SEND_HOUR };
}

export function shouldEscalate(
	t: { due_date: string; escalated_on: string | null; assigned_by: number | null; assignee_id: number },
	today: string
) {
	return t.escalated_on === null && t.assigned_by !== null && t.assigned_by !== t.assignee_id && daysBetween(t.due_date, today) >= ESCALATE_AFTER;
}
