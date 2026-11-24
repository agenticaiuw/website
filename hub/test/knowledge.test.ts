import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { canEdit, createPage, freeSlug, knowledgeText, pagesFor } from '../src/lib/server/knowledge.ts';
import type { Viewer } from '../src/lib/types.ts';

/** Just enough of D1 over an in-memory SQLite, with the real knowledge base tables. */
function fakeD1() {
	const sql = new DatabaseSync(':memory:');
	sql.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
		CREATE TABLE team_members (team_id INTEGER NOT NULL, member_id INTEGER NOT NULL, can_manage_page INTEGER NOT NULL DEFAULT 0);
		INSERT INTO teams VALUES (1, 'Exec Board', 'exec', 0), (2, 'Hardware', 'project', 0), (4, 'Browser', 'project', 1);
		INSERT INTO members VALUES (10, 'Ana Exec'), (11, 'Ben Lead'), (12, 'Cy Manager'), (13, 'Di Member');
		INSERT INTO team_members VALUES (2, 11, 0), (2, 12, 1), (2, 13, 0);`);
	sql.exec(readFileSync(new URL('../migrations/0038_knowledge.sql', import.meta.url), 'utf8'));
	const db = {
		prepare: (q: string) => {
			let params: unknown[] = [];
			const stmt = {
				bind: (...p: unknown[]) => ((params = p), stmt),
				all: async () => ({ results: sql.prepare(q).all(...(params as never[])) }),
				first: async () => sql.prepare(q).get(...(params as never[])) ?? null,
				run: async () => ({ meta: { last_row_id: Number(sql.prepare(q).run(...(params as never[])).lastInsertRowid) } })
			};
			return stmt;
		}
	};
	return { sql, db: db as unknown as D1Database };
}

const viewer = (id: number, role: 'exec' | 'member', leadOf: number[] = []) =>
	({ id, role, teamIds: new Set([2]), leadOf: new Set(leadOf), business: false }) as unknown as Viewer;
const exec = viewer(10, 'exec');
const lead = viewer(11, 'member', [2]);
const manager = viewer(12, 'member');
const member = viewer(13, 'member');

async function seeded() {
	const { sql, db } = fakeD1();
	await createPage(db, exec, { title: 'Meetings', area: 'How we work', audience: 'members', body: 'Every team meets every week.' });
	await createPage(db, exec, { title: 'Board notes', area: 'How we work', audience: 'execs', body: 'Exec only.' });
	await createPage(db, exec, { title: 'Hardware', area: 'Teams', audience: 'members', team_id: 2 });
	await createPage(db, exec, { title: 'Browser', area: 'Teams', audience: 'members', team_id: 4, body: 'Old team.' });
	await createPage(db, exec, { title: 'Gone', area: 'Plans', audience: 'members', body: 'Removed.' });
	sql.exec(`UPDATE kb_pages SET removed_at = '2026-11-23T00:00:00Z' WHERE slug = 'gone'`);
	return { sql, db };
}

test('members see the members pages; execs also see the exec pages; removed pages and archived teams are hidden', async () => {
	const { db } = await seeded();
	assert.deepEqual((await pagesFor(db, member)).map((p) => p.title), ['Meetings', 'Hardware']);
	assert.deepEqual((await pagesFor(db, exec)).map((p) => p.title), ['Meetings', 'Board notes', 'Hardware']);
});

test("execs edit every page; a team's leads and page managers edit only that team's page", async () => {
	const { db } = await seeded();
	const meetings = { team_id: null, audience: 'members' as const };
	const hardware = { team_id: 2, audience: 'members' as const };
	const execTeam = { team_id: 2, audience: 'execs' as const };
	assert.equal(await canEdit(db, exec, meetings), true);
	assert.equal(await canEdit(db, lead, hardware), true);
	assert.equal(await canEdit(db, manager, hardware), true);
	assert.equal(await canEdit(db, member, hardware), false);
	assert.equal(await canEdit(db, lead, meetings), false);
	assert.equal(await canEdit(db, lead, execTeam), false);
});

test("Badger's text is the newest version of each page it may read, skipping empty ones", async () => {
	const { sql, db } = await seeded();
	sql.exec(`INSERT INTO kb_versions (page_id, body) SELECT id, 'Every team meets every Sunday.' FROM kb_pages WHERE slug = 'meetings'`);
	const forMembers = await knowledgeText(db, false);
	assert.match(forMembers, /# Meetings\nSection: How we work\n\nEvery team meets every Sunday\./);
	assert.doesNotMatch(forMembers, /every week|Exec only|Old team|Removed|# Hardware/);
	assert.match(await knowledgeText(db, true), /# Board notes \(execs only\)/);
});

test('new pages get a free address that never takes the constitution’s', async () => {
	const { db } = await seeded();
	assert.equal(await freeSlug(db, 'Meetings'), 'meetings-2');
	assert.equal(await freeSlug(db, 'Constitution'), 'constitution-2');
	assert.equal(await freeSlug(db, '¿Qué?'), 'que');
});
