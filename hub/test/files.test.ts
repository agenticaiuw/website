import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { addFiles, canRemoveFile, canSeeFile, FILES_BUDGET, fileByKey, fileResponse, uploadPlaces, visibleFiles } from '../src/lib/server/files.ts';
import type { Viewer } from '../src/lib/types.ts';

/** Just enough of D1 over an in-memory SQLite for these queries. */
function fakeD1() {
	const sql = new DatabaseSync(':memory:');
	sql.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
		CREATE TABLE club_files (key TEXT PRIMARY KEY, name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL,
			updated_at TEXT NOT NULL DEFAULT '2026-11-23T00:00:00Z', team_id INTEGER, uploaded_by INTEGER, removed_at TEXT NOT NULL DEFAULT '', removed_by INTEGER);
		INSERT INTO teams VALUES (1, 'Exec Board', 'exec', 0), (2, 'Hardware', 'project', 0), (3, 'Business', 'project', 0), (4, 'Browser', 'project', 1);
		INSERT INTO members VALUES (10, 'Exec'), (20, 'Hardware member'), (30, 'Hardware lead');`);
	// D1 takes ArrayBuffers for BLOBs; node:sqlite wants a typed array.
	const fix = (p: unknown[]) => p.map((x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x)) as never[];
	const prepare = (q: string) => {
		let params: unknown[] = [];
		const stmt = {
			bind: (...p: unknown[]) => ((params = p), stmt),
			all: async () => ({ results: sql.prepare(q).all(...fix(params)) }),
			first: async () => sql.prepare(q).get(...fix(params)) ?? null,
			run: async () => {
				const r = sql.prepare(q).run(...fix(params));
				return { meta: { changes: Number(r.changes) } };
			}
		};
		return stmt;
	};
	const db = {
		prepare,
		batch: async (stmts: { run: () => Promise<unknown> }[]) => {
			sql.exec('BEGIN');
			const out = [];
			for (const s of stmts) out.push(await s.run());
			sql.exec('COMMIT');
			return out;
		}
	};
	// R2, as far as the Files page uses it.
	const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>();
	const files = {
		put: async (key: string, bytes: ArrayBuffer, opts: { httpMetadata: { contentType: string } }) => void objects.set(key, { bytes: new Uint8Array(bytes), type: opts.httpMetadata.contentType }),
		get: async (key: string) => {
			const o = objects.get(key);
			return o ? { body: new Blob([o.bytes]).stream(), size: o.bytes.byteLength } : null;
		},
		delete: async (keys: string[]) => keys.forEach((k) => objects.delete(k))
	};
	const env = { DB: db as unknown as D1Database, FILES: files as unknown as R2Bucket };
	return { sql, db: env.DB, env, objects };
}

const viewer = (id: number, role: 'exec' | 'member', teams: number[] = [], leads: number[] = []) =>
	({ id, role, teamIds: new Set(teams), leadOf: new Set(leads), business: false }) as unknown as Viewer;
const exec = viewer(10, 'exec');
const member = viewer(20, 'member', [2]);
const lead = viewer(30, 'member', [2], [2]);
const outsider = viewer(40, 'member', [3]);

const file = (name: string, text = name) => ({ name, type: 'text/plain', bytes: new TextEncoder().encode(text).buffer as ArrayBuffer });

test('a team sees its own files, execs see everything, everyone sees club files', () => {
	const club = { team_id: null, team_kind: null };
	const hardware = { team_id: 2, team_kind: 'project' as const };
	const execBoard = { team_id: 1, team_kind: 'exec' as const };
	assert.ok(canSeeFile(outsider, club));
	assert.ok(canSeeFile(member, hardware));
	assert.ok(!canSeeFile(outsider, hardware));
	assert.ok(!canSeeFile(member, execBoard));
	assert.ok(canSeeFile(exec, execBoard) && canSeeFile(exec, hardware));
});

test('who can remove a file', () => {
	const mine = { key: 'a', team_id: 2, uploaded_by: 20 };
	const theirs = { key: 'b', team_id: 2, uploaded_by: 99 };
	assert.ok(canRemoveFile(member, mine));
	assert.ok(!canRemoveFile(member, theirs));
	assert.ok(canRemoveFile(lead, theirs));
	assert.ok(canRemoveFile(exec, theirs));
	// The Handbook links to the constitution, so it stays.
	assert.ok(!canRemoveFile(exec, { key: 'constitution', team_id: null, uploaded_by: null }));
});

test('execs upload anywhere; members only to their active project teams', async () => {
	const { db } = fakeD1();
	assert.deepEqual((await uploadPlaces(db, exec)).map((p) => p.name), ['Whole club', 'Exec Board', 'Business', 'Hardware']);
	assert.deepEqual((await uploadPlaces(db, member)).map((p) => p.name), ['Hardware']);
	assert.deepEqual(await uploadPlaces(db, viewer(50, 'member', [4])), []);
});

test('files go to R2, download whole, and are listed by place for who can see them', async () => {
	const { sql, db, env, objects } = fakeD1();
	const big = 'x'.repeat(1024 * 1024 + 10);
	assert.ok(await addFiles(env, member.id, 2, [file('notes.txt', big), file('plan.txt')]));
	assert.ok(await addFiles(env, exec.id, null, [file('logo.txt')]));
	assert.ok(await addFiles(env, exec.id, 1, [file('budget.txt')]));
	assert.equal(objects.size, 4);
	const notes = sql.prepare("SELECT key FROM club_files WHERE name = 'notes.txt'").get() as { key: string };
	const res = await fileResponse(env, (await fileByKey(db, notes.key))!);
	assert.equal(await res.text(), big);
	assert.match(res.headers.get('content-disposition')!, /notes\.txt/);

	const seen = async (v: Viewer) => (await visibleFiles(db, v)).map((g) => [g.place.name, g.files.map((f) => f.name)]);
	assert.deepEqual(await seen(member), [['Whole club', ['logo.txt']], ['Hardware', ['notes.txt', 'plan.txt']]]);
	assert.deepEqual(await seen(outsider), [['Whole club', ['logo.txt']]]);
	assert.deepEqual(await seen(exec), [['Whole club', ['logo.txt']], ['Exec Board', ['budget.txt']], ['Hardware', ['notes.txt', 'plan.txt']]]);

	// Removed files leave the list, and their bytes stay so they can be put back.
	sql.exec(`UPDATE club_files SET removed_at = '2026-11-23T01:00:00Z' WHERE name = 'plan.txt'`);
	assert.deepEqual(await seen(member), [['Whole club', ['logo.txt']], ['Hardware', ['notes.txt']]]);
	assert.equal(objects.size, 4);
});

test('nothing is added when the library would go over its budget', async () => {
	const { sql, env, objects } = fakeD1();
	sql.exec(`INSERT INTO club_files (key, name, media_type, size) VALUES ('old', 'old.pdf', 'application/pdf', ${FILES_BUDGET - 3})`);
	assert.equal(await addFiles(env, exec.id, null, [file('a.txt', 'ab'), file('b.txt', 'cd')]), false);
	assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM club_files').get() as { n: number }).n, 1);
	assert.equal(objects.size, 0);
});

test('a missing R2 object is a server error, not an empty file', async () => {
	const { env } = fakeD1();
	const res = await fileResponse(env, { key: 'gone', name: 'gone.pdf', media_type: 'application/pdf' });
	assert.equal(res.status, 500);
});
