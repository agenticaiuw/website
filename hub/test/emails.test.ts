import assert from 'node:assert/strict';
import { test } from 'node:test';
import { andList, assignedEmail, canceledEmail, dueChangedEmail, meetingEmail } from '../src/emails.ts';

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
	assert.match(e.html, /to everyone on Browser and PC\./);
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
	const e = dueChangedEmail('Ife', 'Evan Liu', { id: 3, title: 'Draft spec', due_date: '2026-11-20', team_name: 'PC', meeting_title: null, url: 'https://hub.example/tasks/3' }, '2026-11-13', '2026-11-08', 'https://hub.example');
	assert.equal(e.subject, 'New due date: Draft spec (now Fri, Nov 20)');
	assert.match(e.text, /Evan Liu moved the due date of a task you're on from Fri, Nov 13 to Fri, Nov 20/);
});

test('a changed meeting says it changed', () => {
	const e = meetingEmail(null, { ...joint, team_names: ['Business'], date: '2026-11-15' }, '2026-11-12', 'https://hub.example', { announce: true, changed: true });
	assert.match(e.subject, /^Updated: Joint sync, Sun, Nov 15/);
	assert.match(e.text, /The Business meeting has changed\. It’s now on Sun, Nov 15\./);
});

test('canceling the rest of a series says how many and through when', () => {
	const e = canceledEmail({ ...joint, team_names: ['Business'], date: '2026-11-19', time: '16:30', end_time: '18:00' }, '2026-11-15', 'https://hub.example', ['2026-11-26', '2026-12-03', '2026-12-10']);
	assert.match(e.subject, /^Canceled: Joint sync, Thu, Nov 19, 4:30–6:00 PM and the 3 after it$/);
	assert.match(e.text, /The Business meeting on Thu, Nov 19 \(4:30–6:00 PM\) is canceled\. So are the 3 after it, through Thu, Dec 10\./);
});
