import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { baseSubject, htmlToText, frameHtml, messageIds, receiveEmail, replyTargets, threadList, threadMessages } from '../src/lib/server/inbox.ts';

function fakeEnv() {
	const sql = new DatabaseSync(':memory:');
	sql.exec('CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');
	sql.exec(readFileSync(new URL('../migrations/0037_inbox.sql', import.meta.url), 'utf8'));
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
	const mail = { put: async (key: string, bytes: ArrayBuffer | Uint8Array) => void objects.set(key, new Uint8Array(bytes)) };
	return { env: { DB: db as unknown as D1Database, MAIL: mail as unknown as R2Bucket }, objects, sql };
}

const eml = (lines: string[]) => new TextEncoder().encode(lines.join('\r\n')).buffer as ArrayBuffer;

const first = eml([
	'From: Jane Sponsor <jane@acme.com>',
	'To: team@agenticaiuw.com',
	'Cc: bob@acme.com, eliu59@wisc.edu',
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
	assert.equal(m.cc_emails, 'bob@acme.com, eliu59@wisc.edu');
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
	const base = { direction: 'in' as const, from_email: 'jane@acme.com', reply_to: '', to_emails: 'team@agenticaiuw.com, bob@acme.com', cc_emails: 'eliu59@wisc.edu' };
	assert.deepEqual(replyTargets([base], 'agenticaiuw.com'), { to: 'jane@acme.com', cc: 'bob@acme.com, eliu59@wisc.edu' });
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
