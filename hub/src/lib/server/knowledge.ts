// The knowledge base: the club's pages (culture, expectations, how we work, each team, meetings,
// money, decisions), each thing written once. Every member reads the members pages; execs also
// read the exec pages. Execs edit every page; a team's leads and page managers edit their team's page.
import { all, first, run } from './db.ts';
import { isExec } from '../perm.ts';
import type { Viewer } from '../types.ts';

export type Audience = 'members' | 'execs';
export type KbPage = { id: number; slug: string; title: string; area: string; team_id: number | null; audience: Audience; sort: number };
export type KbVersion = { id: number; body: string; edited_at: string; note: string; name: string | null };

const PAGE = 'SELECT id, slug, title, area, team_id, audience, sort FROM kb_pages';
const VERSION = 'SELECT v.id, v.body, v.edited_at, v.note, m.name FROM kb_versions v LEFT JOIN members m ON m.id = v.edited_by';

export const canRead = (v: Viewer, p: Pick<KbPage, 'audience'>) => p.audience === 'members' || isExec(v);

/** The pages this person may read, in Handbook order. */
export async function pagesFor(db: D1Database, v: Viewer) {
	return all<KbPage & { team_name: string | null; edited_at: string | null }>(
		db,
		`SELECT p.id, p.slug, p.title, p.area, p.team_id, p.audience, p.sort, t.name AS team_name,
			(SELECT max(edited_at) FROM kb_versions WHERE page_id = p.id) AS edited_at
		 FROM kb_pages p LEFT JOIN teams t ON t.id = p.team_id
		 WHERE p.removed_at = '' AND (p.audience = 'members' OR ?1) AND (p.team_id IS NULL OR t.archived = 0)
		 ORDER BY p.sort, p.title`,
		isExec(v) ? 1 : 0
	);
}

export const pageBySlug = (db: D1Database, slug: string) => first<KbPage>(db, `${PAGE} WHERE slug = ? AND removed_at = ''`, slug);
export const teamPage = (db: D1Database, teamId: number) => first<KbPage>(db, `${PAGE} WHERE team_id = ? AND removed_at = ''`, teamId);

export const latestVersion = (db: D1Database, pageId: number) => first<KbVersion>(db, `${VERSION} WHERE v.page_id = ? ORDER BY v.id DESC LIMIT 1`, pageId);
export const versionById = (db: D1Database, pageId: number, id: number) => first<KbVersion>(db, `${VERSION} WHERE v.page_id = ? AND v.id = ?`, pageId, id);
export const history = (db: D1Database, pageId: number) =>
	all<Omit<KbVersion, 'body'>>(db, `SELECT v.id, v.edited_at, v.note, m.name FROM kb_versions v LEFT JOIN members m ON m.id = v.edited_by WHERE v.page_id = ? ORDER BY v.id DESC LIMIT 50`, pageId);

/** Execs edit every page; a team's leads and the people who manage its page edit the team's page. */
export async function canEdit(db: D1Database, v: Viewer, p: Pick<KbPage, 'team_id' | 'audience'>) {
	if (isExec(v)) return true;
	if (p.team_id == null || p.audience !== 'members') return false;
	if (v.leadOf.has(p.team_id)) return true;
	return !!(await first(db, 'SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ? AND can_manage_page = 1', p.team_id, v.id));
}

export function slugify(title: string) {
	return (
		title
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'page'
	);
}

/** A slug nobody uses yet ("constitution" is the constitution's own page). */
export async function freeSlug(db: D1Database, title: string) {
	const base = slugify(title);
	for (let n = 1; ; n++) {
		const slug = n === 1 ? base : `${base}-${n}`;
		if (slug !== 'constitution' && slug !== 'new' && !(await first(db, 'SELECT 1 FROM kb_pages WHERE slug = ?', slug))) return slug;
	}
}

export async function createPage(db: D1Database, v: Viewer, page: { title: string; area: string; audience: Audience; team_id?: number | null; body?: string }) {
	const slug = await freeSlug(db, page.title);
	const sort = (await first<{ n: number }>(db, 'SELECT coalesce(max(sort), 0) + 10 AS n FROM kb_pages'))?.n ?? 10;
	const res = await run(db, 'INSERT INTO kb_pages (slug, title, area, team_id, audience, sort, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', slug, page.title, page.area, page.team_id ?? null, page.audience, sort, v.id);
	if (page.body) await run(db, 'INSERT INTO kb_versions (page_id, body, edited_by) VALUES (?, ?, ?)', res.meta.last_row_id, page.body, v.id);
	return slug;
}

/** Every page a reader may see, as one Markdown text: for Badger. */
export async function knowledgeText(db: D1Database, exec: boolean) {
	const rows = await all<{ title: string; area: string; audience: Audience; body: string | null; team: string | null }>(
		db,
		`SELECT p.title, p.area, p.audience, t.name AS team,
			(SELECT body FROM kb_versions WHERE page_id = p.id ORDER BY id DESC LIMIT 1) AS body
		 FROM kb_pages p LEFT JOIN teams t ON t.id = p.team_id
		 WHERE p.removed_at = '' AND (p.audience = 'members' OR ?1) AND (p.team_id IS NULL OR t.archived = 0)
		 ORDER BY p.sort, p.title`,
		exec ? 1 : 0
	);
	return rows
		.filter((r) => r.body?.trim())
		.map((r) => `# ${r.title}${r.audience === 'execs' ? ' (execs only)' : ''}\n${r.area ? `Section: ${r.area}\n` : ''}\n${r.body!.trim()}`)
		.join('\n\n');
}
