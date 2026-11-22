import assert from 'node:assert/strict';
import { test } from 'node:test';
import { andList, assignedEmail, canceledEmail, dueChangedEmail, meetingEmail, reminderEmail, taskReminderEmail } from '../src/lib/server/emails.ts';

const joint = {
	id: 7,
	kind: 'meeting' as const,
	title: 'Joint sync',
	team_names: ['Browser', 'PC'],
	date: '2026-11-12',
	time: '18:00',
	end_time: '19:00',
	location: 'CS 1240',
	doc_url: '',
	agenda: ''
};

test('andList joins names the way a sentence would', () => {
	assert.equal(andList(['Browser']), 'Browser');
	assert.equal(andList(['Browser', 'PC']), 'Browser and PC');
	assert.equal(andList(['Browser', 'Cloud', 'PC']), 'Browser, Cloud and PC');
});

test('a new-meeting announcement greets everyone and names every team', () => {
	const e = meetingEmail(null, joint, '2026-11-06', 'https://hub.example', { announce: true, repeats: 'It repeats every week until Thu, Dec 17.' });
	assert.match(e.subject, /^New meeting: Joint sync, Thu, Nov 12, /);
	assert.match(e.text, /^Hi everyone,\n\nBrowser and PC have a new meeting on Thu, Nov 12\. It repeats every week until Thu, Dec 17\./);
	// The footer is the club's social links, and the logo is at the top.
	assert.match(e.html, /href="https:\/\/discord\.gg\/[^"]+"[^>]*>Discord<\/a>/);
	assert.match(e.html, />Instagram<\/a>.*>LinkedIn<\/a>.*>X<\/a>/s);
	assert.match(e.html, /<img src="https:\/\/hub\.example\/apple-touch-icon\.png"/);
	assert.doesNotMatch(e.html, /Questions\? Reply|Sent by the club/);
});

test('a new club event says it is open to everyone', () => {
	const e = meetingEmail(null, { ...joint, kind: 'event', team_names: ['Exec Board'] }, '2026-11-11', 'https://hub.example', { announce: true });
	assert.match(e.subject, /^New club event: Joint sync, Tomorrow, /);
	assert.match(e.text, /There’s a new club event tomorrow\. It’s open to everyone\./);
});

test('the day-of reminder for one team reads as before', () => {
	const e = meetingEmail('Ava Chen', { ...joint, team_names: ['Browser'] }, '2026-11-12', 'https://hub.example');
	assert.match(e.subject, /^Today: Joint sync/);
	assert.match(e.text, /^Hi Ava,\n\nBrowser meets today\./);
});

test('several tasks for one person go in one email, each date said once', () => {
	const task = (id: number, title: string, due_date: string) => ({ id, title, due_date, team_name: 'PC', meeting_title: null, url: `https://hub.example/tasks/${id}` });
	const e = assignedEmail('Ife', 'Evan Liu', [task(1, 'Order boards', '2026-11-09'), task(2, 'Draft spec', '2026-11-20')], '2026-11-08', 'https://hub.example');
	assert.equal(e.subject, '2 new tasks assigned to you');
	assert.match(e.text, /- Order boards \(Due tomorrow, Mon, Nov 9\)/);
	assert.match(e.text, /- Draft spec \(Due Fri, Nov 20\)/);
	assert.doesNotMatch(e.html, /Fri, Nov 20<\/span><span[^>]*> · Fri, Nov 20/);
});

test('a moved due date says the old and new dates', () => {
	const e = dueChangedEmail('Ife', 'Evan Liu', { id: 3, title: 'Draft spec', due_date: '2026-11-20', team_name: 'PC', meeting_title: null, url: 'https://hub.example/tasks/3' }, { date: '2026-11-13', time: '' }, '2026-11-08', 'https://hub.example');
	assert.equal(e.subject, 'New due date: Draft spec (now Fri, Nov 20)');
	assert.match(e.text, /Evan Liu moved the due date of a task you're on from Fri, Nov 13 to Fri, Nov 20/);
	const timed = dueChangedEmail('Ife', 'Evan Liu', { id: 3, title: 'Draft spec', due_date: '2026-11-20', due_time: '19:00', team_name: 'PC', meeting_title: null, url: 'https://hub.example/tasks/3' }, { date: '2026-11-20', time: '17:00' }, '2026-11-08', 'https://hub.example');
	assert.equal(timed.subject, 'New due time: Draft spec (now Fri, Nov 20, 7:00 PM)');
	assert.match(timed.text, /from Fri, Nov 20, 5:00 PM to Fri, Nov 20, 7:00 PM/);
});

test('a task with a due time shows it, and the 4-hours-before reminder says so', () => {
	const t = { id: 4, title: 'Submit poster', due_date: '2026-11-08', due_time: '17:00', team_name: 'PC', meeting_title: null, url: 'https://hub.example/tasks/4' };
	const e = reminderEmail('Ife', { overdue: [], hours: [t], today: [], soon: [], followUp: [] }, '2026-11-08', 'https://hub.example');
	assert.equal(e.subject, 'Due in 4 hours: Submit poster');
	assert.match(e.text, /DUE IN 4 HOURS\n- Submit poster \(Due today, Sun, Nov 8, 5:00 PM\)/);
	const later = assignedEmail('Ife', null, [{ ...t, due_date: '2026-11-20' }], '2026-11-08', 'https://hub.example');
	assert.equal(later.subject, 'New task: Submit poster (due Fri, Nov 20, 5:00 PM)');
	assert.match(later.text, /\(Due Fri, Nov 20, 5:00 PM\)/);
});

test('the hour-before meeting reminder says in an hour', () => {
	const e = meetingEmail('Ava Chen', { ...joint, team_names: ['Browser'] }, '2026-11-12', 'https://hub.example', { soon: true });
	assert.equal(e.subject, 'In an hour: Joint sync, 6:00–7:00 PM');
	assert.match(e.text, /^Hi Ava,\n\nBrowser meets in an hour\./);
	const event = meetingEmail('Ava Chen', { ...joint, kind: 'event' }, '2026-11-12', 'https://hub.example', { soon: true });
	assert.match(event.text, /There’s a club event in an hour\. It’s open to everyone\./);
});

test('a changed meeting names only what changed', () => {
	const business = { ...joint, team_names: ['Business'], date: '2026-11-15' };
	const moved = meetingEmail(null, business, '2026-11-12', 'https://hub.example', { announce: true, changed: { date: true } });
	assert.match(moved.subject, /^Updated: Joint sync, Sun, Nov 15/);
	assert.match(moved.text, /The Business meeting has a new date: Sun, Nov 15\./);
	// A new room on the same day says the place, never the date.
	const room = meetingEmail(null, { ...joint, team_names: ['Exec Board'], location: 'Morgridge 2nd Floor Org Suite' }, '2026-11-12', 'https://hub.example', { announce: true, changed: { place: true } });
	assert.match(room.text, /The Exec Board meeting today has a new place: Morgridge 2nd Floor Org Suite\./);
	assert.doesNotMatch(room.text, /date|It’s now/);
	const time = meetingEmail(null, business, '2026-11-14', 'https://hub.example', { announce: true, changed: { time: true } });
	assert.match(time.text, /The Business meeting tomorrow has a new time: 6:00–7:00 PM\./);
	const all = meetingEmail(null, business, '2026-11-12', 'https://hub.example', { announce: true, changed: { date: true, time: true, place: true } });
	assert.match(all.text, /The Business meeting has a new date, time and place: Sun, Nov 15, 6:00–7:00 PM, CS 1240\./);
	const later = meetingEmail(null, business, '2026-11-12', 'https://hub.example', { announce: true, changed: { laterDates: true } });
	assert.match(later.text, /The later Business meetings in this series have new dates\./);
});

test('canceling the rest of a series says how many and through when', () => {
	const e = canceledEmail({ ...joint, team_names: ['Business'], date: '2026-11-19', time: '16:30', end_time: '18:00' }, '2026-11-15', 'https://hub.example', ['2026-11-26', '2026-12-03', '2026-12-10']);
	assert.match(e.subject, /^Canceled: Joint sync, Thu, Nov 19, 4:30–6:00 PM and the 3 after it$/);
	assert.match(e.text, /The Business meeting on Thu, Nov 19 \(4:30–6:00 PM\) is canceled\. So are the 3 after it, through Thu, Dec 10\./);
});

test('a reminder from the task page carries the sender’s message, escaped, with its line breaks', () => {
	const task = { id: 12, title: 'Upload Photos to Photos Folder', due_date: '2026-11-21', due_time: '', team_name: null, meeting_title: null, url: 'https://hub.example/tasks/12?mine=1' };
	const e = taskReminderEmail('everyone', 'Evan Liu', 'Please upload <b>tonight</b>.\nThe folder is shared.', task, '2026-11-20', 'https://hub.example');
	assert.equal(e.subject, 'Reminder: Upload Photos to Photos Folder (due Sat, Nov 21)');
	assert.match(e.text, /^Hi everyone,\n\nEvan Liu sent a reminder about a task you're on:\n\nPlease upload <b>tonight<\/b>\.\nThe folder is shared\.\n— Evan Liu/);
	assert.match(e.html, /Please upload &lt;b&gt;tonight&lt;\/b&gt;\.<br>The folder is shared\./);
	assert.match(e.html, /href="https:\/\/hub\.example\/tasks\/12\?mine=1"/);
	// One email to several people has no personal Mark done link.
	assert.doesNotMatch(e.html, /Mark done/);
});
