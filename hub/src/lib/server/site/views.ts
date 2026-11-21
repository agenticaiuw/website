import type { Edit, HistoryEntry, ShownChange } from '../../site';
import { sectionByKey } from './schema';
import { type Change, type TeamNames, type VersionRow, defaultsFor, diffSection, wordDiff } from './store';

export const edit = (row?: VersionRow | null): Edit => (row ? { id: row.id, name: row.name, edited_at: row.edited_at } : null);

const shown = (changes: Change[]): ShownChange[] => changes.map((ch) => ({ ...ch, parts: ch.before && ch.after ? wordDiff(ch.before, ch.after) : [] }));

export function changesOf(r: VersionRow & { prev: string | null }, teams: TeamNames) {
	const section = sectionByKey(r.section);
	if (!section) return [];
	const before = r.prev ? { ...defaultsFor(r.section), ...JSON.parse(r.prev) } : defaultsFor(r.section);
	return shown(diffSection(section, before, { ...defaultsFor(r.section), ...JSON.parse(r.data) }, teams));
}

/** One version for a history list, with its first `limit` changes. */
export function historyEntry(r: VersionRow & { prev: string | null }, teams: TeamNames, latestId: number | undefined, limit = 12): HistoryEntry {
	const changes = changesOf(r, teams);
	return {
		id: r.id,
		section: r.section,
		sectionTitle: sectionByKey(r.section)?.title ?? r.section,
		name: r.name,
		edited_at: r.edited_at,
		note: r.note,
		restored_from: r.restored_from,
		live: latestId === r.id,
		total: changes.length,
		changes: changes.slice(0, limit)
	};
}
