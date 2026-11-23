import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { connect, groupStatus, syncGroup } from '../src/lib/server/google-group.ts';

/** Just enough of D1 over an in-memory SQLite for these queries. */
function fakeD1() {
	const sql = new DatabaseSync(':memory:');
	sql.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE newsletter (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, sources TEXT NOT NULL DEFAULT '',
			group_added_at TEXT NOT NULL DEFAULT '', group_error TEXT NOT NULL DEFAULT '');`);
	const db = {
		prepare: (q: string) => {
			let params: unknown[] = [];
			const stmt = {
				bind: (...p: unknown[]) => ((params = p), stmt),
				all: async () => ({ results: sql.prepare(q).all(...(params as never[])) }),
				first: async (col?: string) => {
					const row = sql.prepare(q).get(...(params as never[])) as Record<string, unknown> | undefined;
					return row ? (col ? row[col] : row) : null;
				},
				run: async () => sql.prepare(q).run(...(params as never[]))
			};
			return stmt;
		}
	};
	return { sql, db: db as unknown as D1Database };
}

const env = (db: D1Database) => ({ DB: db, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'shh' }) as never;
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

/** Google, as far as the hub talks to it. `members` answers each add by address. */
function google(members: Record<string, number>, opts: { refresh?: 'ok' | 'revoked' } = {}) {
	const added: string[] = [];
	globalThis.fetch = (async (input: string, init?: RequestInit) => {
		const url = String(input);
		if (url === 'https://oauth2.googleapis.com/token') {
			const body = new URLSearchParams(String(init!.body));
			if (body.get('grant_type') === 'refresh_token' && opts.refresh === 'revoked') return Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 });
			return Response.json({ access_token: 'access', refresh_token: 'refresh-secret', id_token: idToken('owner@wisc.edu') });
		}
		if (url.includes('groups:lookup')) return Response.json({ name: 'groups/abc123' });
		if (url.endsWith('/groups/abc123/memberships')) {
			const email = (JSON.parse(String(init!.body)) as { preferredMemberKey: { id: string } }).preferredMemberKey.id;
			added.push(email);
			const status = members[email] ?? 200;
			return Response.json(status === 200 ? { done: true } : { error: { code: status, message: status === 400 ? 'External members are not allowed in this group.' : 'Backend error' } }, { status });
		}
		return new Response('unexpected', { status: 404 });
	}) as typeof fetch;
	return added;
}

test('connecting keeps the sign-in encrypted and checks the group', async () => {
	const { sql, db } = fakeD1();
	google({});
	assert.equal(await connect(env(db), 'code'), 'owner@wisc.edu');
	const meta = Object.fromEntries((sql.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
	assert.equal(meta.google_group_account, 'owner@wisc.edu');
	assert.equal(meta.google_group_name, 'groups/abc123');
	assert.ok(meta.google_group_token);
	assert.doesNotMatch(meta.google_group_token, /refresh-secret/);
});

test('adds website signups only, keeps refusals, and stops at a Google outage', async () => {
	const { sql, db } = fakeD1();
	sql.exec(`INSERT INTO newsletter (email, sources) VALUES
		('new@example.com', 'Website signup 2026-11-23'),
		('already@example.com', 'Fall kickoff RSVP; Website signup 2026-11-23'),
		('outside@example.com', 'Website signup 2026-11-23'),
		('kickoff@example.com', 'Fall kickoff RSVP'),
		('later@example.com', 'Website signup 2026-11-23'),
		('after@example.com', 'Website signup 2026-11-23')`);
	google({});
	await connect(env(db), 'code');
	const tried = google({ 'already@example.com': 409, 'outside@example.com': 400, 'later@example.com': 503 });
	await syncGroup(env(db));
	assert.deepEqual(tried, ['new@example.com', 'already@example.com', 'outside@example.com', 'later@example.com']);
	const rows = Object.fromEntries((sql.prepare('SELECT email, group_added_at, group_error FROM newsletter').all() as { email: string; group_added_at: string; group_error: string }[]).map((r) => [r.email, r]));
	assert.ok(rows['new@example.com'].group_added_at);
	assert.ok(rows['already@example.com'].group_added_at);
	assert.equal(rows['outside@example.com'].group_added_at, '');
	assert.match(rows['outside@example.com'].group_error, /External members/);
	assert.equal(rows['kickoff@example.com'].group_added_at, '');
	assert.equal(rows['later@example.com'].group_error, '');
	assert.equal(rows['after@example.com'].group_added_at, '');

	// The next run picks up where the outage stopped, and doesn't retry the refusal.
	const retried = google({});
	await syncGroup(env(db));
	assert.deepEqual(retried, ['later@example.com', 'after@example.com']);
	const status = await groupStatus(env(db));
	assert.equal(status.added, 4);
	assert.equal(status.waiting, 0);
	assert.deepEqual(status.failed.map((f) => f.email), ['outside@example.com']);
});

test('a revoked sign-in says so and leaves signups waiting', async () => {
	const { sql, db } = fakeD1();
	sql.exec(`INSERT INTO newsletter (email, sources) VALUES ('new@example.com', 'Website signup 2026-11-23')`);
	google({});
	await connect(env(db), 'code');
	const tried = google({}, { refresh: 'revoked' });
	await syncGroup(env(db));
	assert.deepEqual(tried, []);
	const status = await groupStatus(env(db));
	assert.match(status.error, /stopped working.*Connect again/);
	assert.equal(status.waiting, 1);
});
