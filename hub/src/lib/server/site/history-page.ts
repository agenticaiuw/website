import { id } from '../form';
import type { Section } from './schema';
import { history, latestRows, teamNames } from './store';
import { historyEntry } from './views';

const PER_PAGE = 25;

/** Every edit, or one section's, newest first, a page at a time (`?before=` the last id shown). */
export async function loadHistory(db: D1Database, url: URL, section?: Section) {
	const before = id(url.searchParams.get('before')) ?? undefined;
	const [rows, latest, teams] = await Promise.all([history(db, { section: section?.key, before, limit: PER_PAGE + 1 }), latestRows(db), teamNames(db)]);
	const more = rows.length > PER_PAGE;
	const entries = rows.slice(0, PER_PAGE).map((r) => historyEntry(r, teams, latest.get(r.section)?.id));
	return {
		title: section ? `${section.title} history` : 'Website history',
		active: 'site' as const,
		section: section ? { key: section.key, title: section.title } : null,
		entries,
		more,
		before: before ?? null,
		base: section ? `/site/${section.key}/history` : '/site/history'
	};
}
