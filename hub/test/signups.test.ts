import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { addSignup, joinTeams, teamSignups } from '../src/lib/server/signups.ts';

/** Just enough of D1 over an in-memory SQLite for these queries. */
function fakeD1() {
	const sql = new DatabaseSync(':memory:');
	sql.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, cal_url TEXT);
		CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
		CREATE TABLE team_members (team_id INTEGER NOT NULL, member_id INTEGER NOT NULL);
		CREATE TABLE team_signups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, major TEXT NOT NULL, team_id INTEGER NOT NULL,
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
		INSERT INTO teams VALUES (1, 'Exec Board', 'exec', 0, NULL), (2, 'Hardware', 'project', 0, 'https://cal.com/hardware-head'),
			(3, 'Cloud', 'project', 0, ''), (4, 'Browser', 'project', 1, NULL), (5, 'Automation', 'project', 0, 'javascript:alert(1)');
		INSERT INTO members VALUES (10, 'Ana Exec', 'exec', 1), (11, 'Ben Member', 'member', 1), (12, 'Cy Exec', 'exec', 1);
		INSERT INTO team_members VALUES (2, 10), (2, 11), (3, 12), (3, 10);`);
	const db = {
		prepare: (q: string) => {
			let params: unknown[] = [];
			const stmt = {
				bind: (...p: unknown[]) => ((params = p), stmt),
				all: async () => ({ results: sql.prepare(q).all(...(params as never[])) }),
				first: async () => sql.prepare(q).get(...(params as never[])) ?? null,
				run: async () => sql.prepare(q).run(...(params as never[]))
			};
			return stmt;
		}
	};
	return { sql, db: db as unknown as D1Database };
}

const MAJOR = 'Computer Sciences, BS';

test('only active project teams can be picked', async () => {
	const { db } = fakeD1();
	assert.deepEqual((await joinTeams(db)).map((t) => t.name), ['Automation', 'Cloud', 'Hardware']);
	assert.deepEqual(await addSignup(db, 'Dee Student', MAJOR, 1), { error: 'missing' });
	assert.deepEqual(await addSignup(db, 'Dee Student', MAJOR, 4), { error: 'missing' });
});

test('a sign-up gets the team head’s booking link and shows on the team page', async () => {
	const { db } = fakeD1();
	assert.deepEqual(await addSignup(db, 'Dee Student', MAJOR, 2), { team: 'Hardware', cal: 'https://cal.com/hardware-head', heads: ['Ana Exec'] });
	// No link yet: the heads are named instead. A link that isn't http(s) is never shown.
	assert.deepEqual(await addSignup(db, 'Eve Student', MAJOR, 3), { team: 'Cloud', cal: '', heads: ['Ana Exec', 'Cy Exec'] });
	assert.deepEqual(await addSignup(db, 'Fay Student', MAJOR, 5), { team: 'Automation', cal: '', heads: [] });
	assert.deepEqual((await teamSignups(db, 2)).map((s) => [s.name, s.major]), [['Dee Student', MAJOR]]);
});

test('a name, a major from the list and a team are required', async () => {
	const { sql, db } = fakeD1();
	assert.deepEqual(await addSignup(db, '', MAJOR, 2), { error: 'missing' });
	assert.deepEqual(await addSignup(db, 'Dee Student', 'Underwater Basket Weaving', 2), { error: 'missing' });
	assert.deepEqual(await addSignup(db, 'Dee Student', MAJOR, null), { error: 'missing' });
	assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM team_signups').get() as { n: number }).n, 0);
});

test('a burst of sign-ups is turned away', async () => {
	const { sql, db } = fakeD1();
	for (let i = 0; i < 30; i++) sql.exec(`INSERT INTO team_signups (name, major, team_id) VALUES ('Bot ${i}', '${MAJOR}', 2)`);
	assert.deepEqual(await addSignup(db, 'Dee Student', MAJOR, 2), { error: 'busy' });
	// Ten minutes later it opens again.
	assert.equal((await addSignup(db, 'Dee Student', MAJOR, 2, new Date(Date.now() + 11 * 60_000))).team, 'Hardware');
});
