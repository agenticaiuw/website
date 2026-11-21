import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, clubTime, daysBetween, dueLabel, hourIn, isDate, todayIn } from '../src/lib/dates.ts';
import { renderMarkdown } from '../src/lib/markdown.ts';
import { MEETING_SOON_HOURS, reminderFor, remindKey, shouldEscalate, TASK_SOON_HOURS, timedReminderFor, urgentReminderFor } from '../src/lib/server/schedule.ts';

const due = '2026-11-10';

/** Simulates the daily run from `start` to `end`, returning the days a reminder went out. */
function simulate(start: string, end: string) {
	const sent: [string, string][] = [];
	let last: string | null = null;
	for (let d = start; d <= end; d = addDays(d, 1)) {
		const kind = reminderFor(due, last, d);
		if (kind) {
			sent.push([d, kind]);
			last = d;
		}
	}
	return sent;
}

test('a heads-up the day before, due-day, then daily overdue for 3 days, then every 3 days', () => {
	assert.deepEqual(simulate('2026-11-01', '2026-11-22'), [
		['2026-11-09', 'soon'],
		['2026-11-10', 'today'],
		['2026-11-11', 'overdue'],
		['2026-11-12', 'overdue'],
		['2026-11-13', 'overdue'],
		['2026-11-16', 'overdue'],
		['2026-11-19', 'overdue'],
		['2026-11-22', 'overdue']
	]);
});

test('never two reminders in one day, even if the run repeats', () => {
	assert.equal(reminderFor(due, '2026-11-12', '2026-11-12'), null);
});

test('a task assigned the day before it is due still gets a heads-up', () => {
	assert.equal(reminderFor(due, null, '2026-11-09'), 'soon');
});

test('a task created already overdue is reminded right away', () => {
	assert.equal(reminderFor(due, null, '2026-11-20'), 'overdue');
});

test('moving the due date out restarts the schedule', () => {
	// Reminded on Nov 8 for the old date; new due date is Nov 30.
	assert.equal(reminderFor('2026-11-30', '2026-11-08', '2026-11-29'), 'soon');
});

test('escalates once, at 3 days overdue, only when someone else assigned it', () => {
	const t = { due_date: due, escalated_on: null, assigned_by: 1, assignee_id: 2 };
	assert.equal(shouldEscalate(t, '2026-11-12'), false);
	assert.equal(shouldEscalate(t, '2026-11-13'), true);
	assert.equal(shouldEscalate({ ...t, escalated_on: '2026-11-13' }, '2026-11-14'), false);
	assert.equal(shouldEscalate({ ...t, assigned_by: 2 }, '2026-11-20'), false);
});

test('club dates follow Chicago time across midnight UTC and DST', () => {
	// 03:00 UTC on Nov 11 is still Nov 10 in Chicago.
	assert.equal(todayIn('America/Chicago', new Date('2026-11-11T03:00:00Z')), '2026-11-10');
	assert.equal(hourIn('America/Chicago', new Date('2026-10-26T14:00:00Z')), 9); // CDT
	assert.equal(hourIn('America/Chicago', new Date('2026-11-02T15:00:00Z')), 9); // CST
	assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
	assert.equal(isDate('2026-02-30'), false);
	assert.deepEqual(dueLabel('2026-11-08', '2026-11-10'), { text: '2 days overdue', tone: 'overdue' });
});

test('club times convert to UTC across daylight saving', () => {
	assert.equal(new Date(clubTime('2026-11-21', '18:00', 'America/Chicago')).toISOString(), '2026-11-22T00:00:00.000Z'); // CST
	assert.equal(new Date(clubTime('2026-10-31', '18:00', 'America/Chicago')).toISOString(), '2026-10-31T23:00:00.000Z'); // CDT
	assert.equal(new Date(clubTime('2026-11-01', '09:00', 'America/Chicago')).toISOString(), '2026-11-01T15:00:00.000Z'); // the switch day
});

/** Runs every 5 minutes from `fromUtc` to `toUtc`, returning when each reminder went out (UTC). */
function simulateTimed(x: { date: string; time: string; created_at: string }, soonHours: number, fromUtc: string, toUtc: string, moveAt?: { at: string; date: string; time: string }) {
	const item = { ...x, reminded_day_for: null as string | null, reminded_soon_for: null as string | null };
	const sent: string[] = [];
	for (let t = Date.parse(fromUtc); t <= Date.parse(toUtc); t += 5 * 60_000) {
		if (moveAt && t === Date.parse(moveAt.at)) Object.assign(item, { date: moveAt.date, time: moveAt.time });
		const kind = timedReminderFor(item, new Date(t), soonHours, 'America/Chicago');
		if (!kind) continue;
		sent.push(`${new Date(t).toISOString().slice(0, 16)} ${kind}`);
		item[kind === 'day' ? 'reminded_day_for' : 'reminded_soon_for'] = remindKey(item);
	}
	return sent;
}

test('meetings: a day before and an hour before, like Luma', () => {
	// 6 PM CST Thu Nov 12 = 00:00 UTC Nov 13.
	const m = { date: '2026-11-12', time: '18:00', created_at: '2026-11-01T12:00:00.000Z' };
	assert.deepEqual(simulateTimed(m, MEETING_SOON_HOURS, '2026-11-10T00:00:00Z', '2026-11-13T06:00:00Z'), ['2026-11-12T00:00 day', '2026-11-12T23:00 soon']);
});

test('meetings made less than a day ahead skip the day-before reminder', () => {
	const m = { date: '2026-11-12', time: '18:00', created_at: '2026-11-12T03:00:00.000Z' };
	assert.deepEqual(simulateTimed(m, MEETING_SOON_HOURS, '2026-11-11T00:00:00Z', '2026-11-13T06:00:00Z'), ['2026-11-12T23:00 soon']);
});

test('a meeting with no time: 9 AM the day before and 9 AM the day of', () => {
	const m = { date: '2026-11-12', time: '', created_at: '2026-11-01T12:00:00.000Z' };
	assert.deepEqual(simulateTimed(m, MEETING_SOON_HOURS, '2026-11-10T00:00:00Z', '2026-11-13T06:00:00Z'), ['2026-11-11T15:00 day', '2026-11-12T15:00 soon']);
});

test('moving a meeting sends its reminders again for the new time', () => {
	const m = { date: '2026-11-12', time: '18:00', created_at: '2026-11-01T12:00:00.000Z' };
	// Moved to Fri 6 PM after the Thursday day-before reminder went out.
	const sent = simulateTimed(m, MEETING_SOON_HOURS, '2026-11-11T00:00:00Z', '2026-11-14T06:00:00Z', { at: '2026-11-12T12:00:00Z', date: '2026-11-13', time: '18:00' });
	assert.deepEqual(sent, ['2026-11-12T00:00 day', '2026-11-13T00:00 day', '2026-11-13T23:00 soon']);
});

test('tasks with a due time: a day before and 4 hours before', () => {
	// Due 5 PM CST Nov 20 = 23:00 UTC.
	const t = { date: '2026-11-20', time: '17:00', created_at: '2026-11-10T12:00:00.000Z' };
	assert.deepEqual(simulateTimed(t, TASK_SOON_HOURS, '2026-11-18T00:00:00Z', '2026-11-21T06:00:00Z'), ['2026-11-19T23:00 day', '2026-11-20T19:00 soon']);
	// Made that morning: only the 4-hour one.
	assert.deepEqual(simulateTimed({ ...t, created_at: '2026-11-20T15:00:00.000Z' }, TASK_SOON_HOURS, '2026-11-20T15:00:00Z', '2026-11-21T06:00:00Z'), ['2026-11-20T19:00 soon']);
});

test('urgent tasks with a due time get reminders from that time', () => {
	const t = { due_date: '2026-11-20', urgent_until: null, reminded_at: null };
	const dueAt = clubTime('2026-11-20', '15:00', 'America/Chicago');
	assert.equal(urgentReminderFor(t, new Date('2026-11-20T20:00:00Z'), '2026-11-20', 14, dueAt), null);
	assert.equal(urgentReminderFor(t, new Date('2026-11-20T21:00:00Z'), '2026-11-20', 15, dueAt), 'overdue');
});

test('notes markdown escapes HTML and only links http(s)', () => {
	const html = renderMarkdown('<script>alert(1)</script>\n- [x] **done** see https://example.com/a?b=1&c=2.\n[bad](javascript:alert(1))');
	assert.ok(!html.includes('<script>'));
	assert.ok(html.includes('&lt;script&gt;'));
	assert.ok(html.includes('<strong>done</strong>'));
	assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'));
	assert.ok(!html.includes('href="javascript'));
	const quoted = renderMarkdown('"https://example.com/x" and <https://example.com/y>');
	assert.ok(quoted.includes('href="https://example.com/x"'));
	assert.ok(quoted.includes('href="https://example.com/y"'));
});

/** Simulates the hourly run for an urgent task, returning the club times a reminder went out. */
function simulateUrgent(dueDate: string, fromUtc: string, hours: number, urgentUntil: string | null, remindedAt: string | null = null) {
	const tz = 'America/Chicago';
	const t = { due_date: dueDate, urgent_until: urgentUntil, reminded_at: remindedAt };
	const sent: string[] = [];
	for (let i = 0; i < hours; i++) {
		// The cron fires a few seconds after the hour.
		const now = new Date(Date.parse(fromUtc) + i * 3_600_000 + (i % 3) * 4_000);
		const today = todayIn(tz, now);
		const hour = hourIn(tz, now);
		const kind = urgentReminderFor(t, now, today, hour);
		if (kind) {
			sent.push(`${today} ${hour} ${kind}`);
			t.reminded_at = now.toISOString();
		}
	}
	return sent;
}

test('urgent: 7, 9 and 11 PM the evening it is due, quiet 1-8 AM, then every 2 hours until the cutoff', () => {
	// From noon CDT Oct 28 (17:00 UTC), after the 9 AM due-today email.
	assert.deepEqual(simulateUrgent('2026-10-28', '2026-10-28T17:00:00Z', 36, '2026-10-29T22:30:00Z', '2026-10-28T14:01:00Z'), [
		'2026-10-28 19 tonight',
		'2026-10-28 21 tonight',
		'2026-10-28 23 tonight',
		'2026-10-29 8 overdue',
		'2026-10-29 10 overdue',
		'2026-10-29 12 overdue',
		'2026-10-29 14 overdue',
		'2026-10-29 16 overdue'
	]);
});

test('urgent: starting late in the evening still spaces them 2 hours apart, midnight included', () => {
	// First run after 8 PM CDT.
	assert.deepEqual(simulateUrgent('2026-10-28', '2026-10-29T01:00:00Z', 14, null).slice(0, 4), ['2026-10-28 20 tonight', '2026-10-28 22 tonight', '2026-10-29 0 overdue', '2026-10-29 8 overdue']);
});

test('urgent: a reminder in the last 2 hours, from either kind of run, holds the next one back', () => {
	const t = { due_date: '2026-11-10', urgent_until: null, reminded_at: '2026-11-12T15:00:05Z' }; // 9 AM CST daily reminder
	assert.equal(urgentReminderFor(t, new Date('2026-11-12T16:00:02Z'), '2026-11-12', 10), null);
	assert.equal(urgentReminderFor(t, new Date('2026-11-12T17:00:01Z'), '2026-11-12', 11), 'overdue');
	assert.equal(urgentReminderFor({ ...t, reminded_at: null }, new Date('2026-11-10T20:00:00Z'), '2026-11-10', 14), null); // due today, before 7 PM
});

test('urgent: club hours hold across the switch back to CST', () => {
	// Nov 1, 2026 is the DST change. Overdue task, no cutoff.
	const sent = simulateUrgent('2026-10-30', '2026-11-01T05:00:00Z', 12, null);
	assert.deepEqual(sent, ['2026-11-01 0 overdue', '2026-11-01 8 overdue', '2026-11-01 10 overdue']);
});
