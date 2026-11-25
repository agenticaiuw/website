import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Env } from '../src/lib/types.ts';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { baseSubject, htmlToText, frameHtml, messageIds, receiveEmail, replyTargets, scheduledIn, scheduleMessage, sendDueScheduled, sendMessage, splitQuote, threadList, threadMessages } from '../src/lib/server/inbox.ts';
import { dayGroup, listDate } from '../src/lib/inbox.ts';

function fakeEnv() {
	const sql = new DatabaseSync(':memory:');
	sql.exec('CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');
	sql.exec(readFileSync(new URL('../migrations/0037_inbox.sql', import.meta.url), 'utf8'));
	sql.exec(readFileSync(new URL('../migrations/0039_inbox_send.sql', import.meta.url), 'utf8'));
	sql.exec('CREATE TABLE email_log (id INTEGER PRIMARY KEY, to_email TEXT, subject TEXT, kind TEXT, status TEXT, error TEXT, html TEXT, bcc TEXT);');
	const fix = (p: unknown[]) => p.map((x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x)) as never[];
	const prepare = (q: string) => {
		let params: unknown[] = [];
		const stmt = {
			bind: (...p: unknown[]) => ((params = p), stmt),
			all: async () => ({ results: sql.prepare(q).all(...fix(params)) }),
			first: async () => sql.prepare(q).get(...fix(params)) ?? null,
			run: async () => sql.prepare(q).run(...fix(params))
		};
		return stmt;
	};
	const db = { prepare, batch: async (stmts: { run: () => Promise<unknown> }[]) => Promise.all(stmts.map((s) => s.run())) };
	const objects = new Map<string, Uint8Array>();
	const mail = {
		put: async (key: string, bytes: ArrayBuffer | Uint8Array) => void objects.set(key, new Uint8Array(bytes)),
		get: async (key: string) => {
			const b = objects.get(key);
			return b ? { arrayBuffer: async () => b.slice().buffer } : null;
		},
		delete: async (key: string) => void objects.delete(key)
	};
	const env = { DB: db as unknown as D1Database, MAIL: mail as unknown as R2Bucket, MAIL_FROM: 'team@agenticaiuw.com', MAIL_FROM_NAME: 'Agentic AI UW', DEV_MODE: '1', TIMEZONE: 'America/Chicago' };
	return { env: env as typeof env & Env, objects, sql };
}

const eml = (lines: string[]) => new TextEncoder().encode(lines.join('\r\n')).buffer as ArrayBuffer;

const first = eml([
	'From: Jane Sponsor <jane@acme.com>',
	'To: team@agenticaiuw.com',
	'Cc: bob@acme.com, lee@example.edu',
	'Subject: Sponsoring your hackathon',
	'Message-ID: <abc123@acme.com>',
	'MIME-Version: 1.0',
	'Content-Type: multipart/mixed; boundary="b"',
	'',
	'--b',
	'Content-Type: multipart/related; boundary="r"',
	'',
	'--r',
	'Content-Type: text/html; charset=utf-8',
	'',
	'<p>Hi! <img src="cid:logo@acme"></p><script>alert(1)</script>',
	'--r',
	'Content-Type: image/png',
	'Content-ID: <logo@acme>',
	'Content-Disposition: inline',
	'Content-Transfer-Encoding: base64',
	'',
	'iVBORw0KGgo=',
	'--r--',
	'--b',
	'Content-Type: application/pdf; name="deck.pdf"',
	'Content-Disposition: attachment; filename="deck.pdf"',
	'Content-Transfer-Encoding: base64',
	'',
	'JVBERi0xLjQK',
	'--b--',
	''
]);

test('an email becomes a thread, with its attachments and inline image kept in R2', async () => {
	const { env, objects } = fakeEnv();
	const id = await receiveEmail(env, first);
	const [m] = await threadMessages(env.DB, id);
	assert.equal(m.from_email, 'jane@acme.com');
	assert.equal(m.from_name, 'Jane Sponsor');
	assert.equal(m.message_id, 'abc123@acme.com');
	assert.equal(m.cc_emails, 'bob@acme.com, lee@example.edu');
	assert.deepEqual(
		m.files.map((f) => [f.name, f.inline]),
		[
			['image', 1],
			['deck.pdf', 0]
		]
	);
	assert.equal(objects.size, 3); // raw + 2 files
	assert.equal(m.text, 'Hi!'); // from the HTML, without the script
	const html = frameHtml(m.html, m.files);
	assert.match(html, new RegExp(`src="/inbox/file/${m.files[0].id}"`));
	assert.match(html, /Content-Security-Policy/);
	const [t] = await threadList(env.DB, 'open');
	assert.equal(t.unread, 1);
	assert.equal(t.who, 'Jane Sponsor');
});

test('a reply joins its thread by In-Reply-To, by subject when the headers are gone, and a repeat is kept once', async () => {
	const { env, sql } = fakeEnv();
	const id = await receiveEmail(env, first);
	assert.equal(await receiveEmail(env, first), id);
	const byHeader = eml(['From: bob@acme.com', 'To: team@agenticaiuw.com', 'Subject: Re: Sponsoring your hackathon', 'Message-ID: <r1@acme.com>', 'In-Reply-To: <abc123@acme.com>', '', 'Yes']);
	assert.equal(await receiveEmail(env, byHeader), id);
	const bySubject = eml(['From: jane@acme.com', 'To: team@agenticaiuw.com', 'Subject: RE: Fwd: sponsoring your hackathon', 'Message-ID: <r2@acme.com>', '', 'Again']);
	assert.equal(await receiveEmail(env, bySubject), id);
	const stranger = eml(['From: x@else.com', 'To: team@agenticaiuw.com', 'Subject: Re: Sponsoring your hackathon', 'Message-ID: <r3@else.com>', '', 'Hm']);
	assert.notEqual(await receiveEmail(env, stranger), id);
	const fresh = eml(['From: jane@acme.com', 'To: team@agenticaiuw.com', 'Subject: Sponsoring your hackathon', 'Message-ID: <r4@acme.com>', '', 'New']);
	assert.notEqual(await receiveEmail(env, fresh), id);
	assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM inbox_messages WHERE thread_id = ?').get(id) as { n: number }).n, 3);
});

test('a done thread opens again when they write back', async () => {
	const { env, sql } = fakeEnv();
	const id = await receiveEmail(env, first);
	sql.prepare("UPDATE inbox_threads SET status = 'done', unread = 0").run();
	await receiveEmail(env, eml(['From: jane@acme.com', 'To: team@agenticaiuw.com', 'Subject: Re: x', 'Message-ID: <z@acme.com>', 'References: <abc123@acme.com>', '', 'Hi']));
	assert.deepEqual({ ...(sql.prepare('SELECT status, unread FROM inbox_threads WHERE id = ?').get(id) as object) }, { status: 'open', unread: 1 });
});

test('replies go to the sender (or their Reply-To) and copy everyone else outside the club', () => {
	const base = { direction: 'in' as const, from_email: 'jane@acme.com', reply_to: '', to_emails: 'team@agenticaiuw.com, bob@acme.com', cc_emails: 'lee@example.edu' };
	assert.deepEqual(replyTargets([base], 'agenticaiuw.com'), { to: 'jane@acme.com', cc: 'bob@acme.com, lee@example.edu' });
	assert.deepEqual(replyTargets([{ ...base, reply_to: 'events@acme.com' }], 'agenticaiuw.com').to, 'events@acme.com');
});

test('subjects and message ids', () => {
	assert.equal(baseSubject('Re: RE: Fwd: Hello there'), 'hello there');
	assert.equal(baseSubject('Re[2]: Hi'), 'hi');
	assert.deepEqual(messageIds('<a@b> <c@d>'), ['a@b', 'c@d']);
	assert.deepEqual(messageIds('bare@id'), ['bare@id']);
	assert.deepEqual(messageIds(undefined), []);
});

test('text from HTML', () => {
	assert.equal(htmlToText('<style>p{}</style><p>Hi&nbsp;there,</p><p>A &amp; B<br>C &#8217;</p>'), 'Hi there,\n\nA & B\nC \u2019');
});

test('a long hidden list goes out in batches of at most 50 addresses', async () => {
	const { batches } = await import('../src/lib/server/mail.ts');
	const people = Array.from({ length: 120 }, (_, i) => ({ name: '', email: `p${i}@wisc.edu` }));
	const parts = batches({ to: { name: '', email: 'team@agenticaiuw.com' }, cc: [{ name: '', email: 'a@b.co' }], bcc: people, subject: 's', text: 't', html: 'h', kind: 'reminder' });
	assert.deepEqual(parts.map((p) => 2 + p.bcc!.length), [50, 50, 26]);
	assert.deepEqual(parts.flatMap((p) => p.bcc!.map((r) => r.email)), people.map((p) => p.email));
});

test('the earlier emails a reply quotes split off its own words, as Gmail and Outlook fold them', () => {
	assert.deepEqual(splitQuote('Sounds good!\n\nOn Mon, Nov 24, 2026 at 3:14 PM Jane <jane@acme.com> wrote:\n> Can we meet?\n> Thanks'), {
		text: 'Sounds good!',
		quote: 'On Mon, Nov 24, 2026 at 3:14 PM Jane <jane@acme.com> wrote:\n> Can we meet?\n> Thanks'
	});
	// Gmail wraps a long "On … wrote:" onto two lines.
	assert.equal(splitQuote('Yes\n\nOn Mon, Nov 24, 2026 at 3:14 PM Jane Sponsor <\njane@acme.com> wrote:\n> Hi').text, 'Yes');
	assert.equal(splitQuote('Thanks,\nBob\n\nFrom: Jane <jane@acme.com>\nSent: Monday, November 24, 2026 3:14 PM\nTo: team@agenticaiuw.com\nSubject: Hi\n\nOld').text, 'Thanks,\nBob');
	assert.equal(splitQuote('Ok\n-----Original Message-----\nFrom: x').text, 'Ok');
	assert.equal(splitQuote('Ok\n\n> a\n>\n> b').quote, '> a\n>\n> b');
	// Answers between quoted lines, forwards, and an email that is all quote stay whole.
	assert.equal(splitQuote('> a\nmy answer\n> b').quote, '');
	assert.equal(splitQuote('FYI\n\n---------- Forwarded message ---------\nFrom: Jane <jane@acme.com>\nDate: Mon\n\nOn Sun Bob wrote:\n> x').quote, '');
	assert.equal(splitQuote('On Mon Jane wrote:\n> hi').quote, '');
});

test('a forward carries the email it forwards and its files; Bcc stays hidden but kept', async () => {
	const { env, sql } = fakeEnv();
	const id = await receiveEmail(env, first);
	const [m] = await threadMessages(env.DB, id);
	const sent = await sendMessage(env, null, id, { mode: 'forward', of: m.id, to: ['sam@example.edu'], cc: [], bcc: ['lee@example.edu'], text: 'For you', files: [] }, 'America/Chicago');
	assert.equal(sent.ok, true);
	const out = (await threadMessages(env.DB, id)).at(-1)!;
	assert.equal(out.direction, 'out');
	assert.equal(out.subject, 'Fwd: Sponsoring your hackathon');
	assert.equal(out.in_reply_to, '');
	assert.equal(out.bcc_emails, 'lee@example.edu');
	assert.match(out.text, /^For you\n\n---------- Forwarded message ---------\nFrom: Jane Sponsor <jane@acme.com>/);
	assert.deepEqual(out.files.map((f) => f.name), ['deck.pdf']);
	const log = sql.prepare('SELECT to_email, bcc FROM email_log').get() as { to_email: string; bcc: string };
	assert.deepEqual({ ...log }, { to_email: 'sam@example.edu (bcc 1 person)', bcc: 'lee@example.edu' });

	await sendMessage(env, null, id, { mode: 'reply', of: m.id, to: ['jane@acme.com'], cc: [], bcc: [], text: 'Thanks!', files: [] }, 'America/Chicago');
	const reply = (await threadMessages(env.DB, id)).at(-1)!;
	assert.equal(reply.subject, 'Re: Sponsoring your hackathon');
	assert.equal(reply.in_reply_to, 'abc123@acme.com');
});

test('a scheduled email waits with its files, then the cron sends it into the thread', async () => {
	const { env, objects, sql } = fakeEnv();
	sql.exec("INSERT INTO members (id, name) VALUES (1, 'Evan Liu')");
	const id = await receiveEmail(env, first);
	const file = { name: 'notes.txt', type: 'text/plain', bytes: new TextEncoder().encode('hi').buffer as ArrayBuffer };
	const at = Date.parse('2026-11-26T14:00:00Z');
	await scheduleMessage(env, 1, id, { mode: 'reply', of: null, to: ['jane@acme.com'], cc: [], bcc: [], text: 'Later', files: [file] }, at);
	const [waiting] = await scheduledIn(env.DB, id);
	assert.equal(waiting.send_at, '2026-11-26T14:00:00.000Z');
	assert.deepEqual(waiting.files, [{ name: 'notes.txt', size: 2 }]);
	assert.equal([...objects.keys()].filter((k) => k.startsWith('sched/')).length, 1);

	assert.deepEqual(await sendDueScheduled(env, new Date(at - 60_000)), { sent: 0, failed: 0 });
	assert.deepEqual(await sendDueScheduled(env, new Date(at)), { sent: 1, failed: 0 });
	assert.deepEqual(await scheduledIn(env.DB, id), []);
	const out = (await threadMessages(env.DB, id)).at(-1)!;
	assert.equal(out.text, 'Later');
	assert.deepEqual(out.files.map((f) => f.name), ['notes.txt']);
	assert.equal([...objects.keys()].filter((k) => k.startsWith('sched/')).length, 0);
});

test('the message list dates and groups conversations the way Outlook does', () => {
	const now = new Date('2026-11-25T18:00:00Z'); // Wednesday, noon in Chicago
	const zone = 'America/Chicago';
	assert.equal(listDate('2026-11-25T15:30:00Z', zone, now), '9:30 AM');
	assert.equal(listDate('2026-11-23T15:30:00Z', zone, now), 'Mon 9:30 AM');
	assert.equal(listDate('2026-10-02T15:30:00Z', zone, now), 'Fri 10/2');
	assert.equal(listDate('2025-10-02T15:30:00Z', zone, now), '10/2/2025');
	assert.deepEqual(
		['2026-11-25T15:00:00Z', '2026-11-24T15:00:00Z', '2026-11-23T15:00:00Z', '2026-11-18T15:00:00Z', '2026-11-12T15:00:00Z', '2026-11-03T15:00:00Z', '2026-10-20T15:00:00Z', '2026-08-01T15:00:00Z'].map((d) => dayGroup(d, zone, now)),
		['Today', 'Yesterday', 'This week', 'Last week', 'Two weeks ago', 'Three weeks ago', 'Last month', 'Older']
	);
});
