import assert from 'node:assert/strict';
import { test } from 'node:test';
import { andList, meetingEmail } from '../src/emails.ts';

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
