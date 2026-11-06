import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, dueLabel, hourIn, isDate, todayIn } from '../src/dates.ts';
import { renderMarkdown } from '../src/markdown.ts';
import { meetingReminderAt, reminderFor, shouldEscalate, urgentReminderFor } from '../src/schedule.ts';

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

test('one heads-up, due-day, then daily overdue for 3 days, then every 3 days', () => {
	assert.deepEqual(simulate('2026-11-01', '2026-11-22'), [
		['2026-11-08', 'soon'],
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
	assert.equal(reminderFor('2026-11-30', '2026-11-08', '2026-11-28'), 'soon');
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

test('meeting reminders: the day of, the evening before for morning meetings, a day ahead for events', () => {
	assert.deepEqual(meetingReminderAt({ kind: 'meeting', date: '2026-11-02', time: '17:30' }), { date: '2026-11-02', hour: 9 });
	assert.deepEqual(meetingReminderAt({ kind: 'meeting', date: '2026-11-02', time: '' }), { date: '2026-11-02', hour: 9 });
	assert.deepEqual(meetingReminderAt({ kind: 'meeting', date: '2026-11-02', time: '11:45' }), { date: '2026-11-01', hour: 18 });
	assert.deepEqual(meetingReminderAt({ kind: 'meeting', date: '2026-11-02', time: '12:00' }), { date: '2026-11-02', hour: 9 });
	assert.deepEqual(meetingReminderAt({ kind: 'event', date: '2026-11-02', time: '09:00' }), { date: '2026-11-01', hour: 9 });
	assert.equal(hourIn('America/Chicago', new Date('2026-10-27T23:00:00Z')), 18); // CDT
	assert.equal(hourIn('America/Chicago', new Date('2026-11-03T00:00:00Z')), 18); // CST
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
