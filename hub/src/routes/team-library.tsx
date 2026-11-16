import { all, MEETING_VISIBLE } from '../db';
import type { Viewer } from '../types';
import { fileKind } from './meeting-content';

type LibraryItem = { id: string; meeting_id: number; meeting_title: string; creator_id: number | null; creator_name: string | null; author_id: number | null; author_name: string | null; name: string; original_name: string; url: string | null };

export async function teamLibrary(db: D1Database, viewer: Viewer, team: number): Promise<LibraryItem[]> {
	const access = `(?3 = 1 OR m.created_by = ?1 OR ${MEETING_VISIBLE} OR EXISTS (
		SELECT 1 FROM team_members lead JOIN meeting_teams mt ON mt.team_id = lead.team_id
		WHERE mt.meeting_id = m.id AND lead.member_id = ?1 AND lead.is_lead = 1))`;
	const teamMatch = `(m.team_id = ?2 OR EXISTS (SELECT 1 FROM meeting_teams mt WHERE mt.meeting_id = m.id AND mt.team_id = ?2))`;
	return all<LibraryItem>(db, `SELECT f.id, m.id AS meeting_id, m.title AS meeting_title, m.created_by AS creator_id, creator.name AS creator_name,
		f.author_id, author.name AS author_name, COALESCE(f.display_name, f.name) AS name, f.name AS original_name, NULL AS url
		FROM meeting_attachments f JOIN meetings m ON m.id = f.meeting_id LEFT JOIN members creator ON creator.id = m.created_by
		LEFT JOIN members author ON author.id = f.author_id WHERE f.removed = 0 AND ${teamMatch} AND ${access}
		UNION ALL
		SELECT l.id, m.id, m.title, m.created_by, creator.name, l.author_id, author.name, l.name, l.name, l.url
		FROM meeting_library_links l JOIN meetings m ON m.id = l.meeting_id LEFT JOIN members creator ON creator.id = m.created_by
		LEFT JOIN members author ON author.id = l.author_id WHERE l.removed = 0 AND ${teamMatch} AND ${access}
		ORDER BY 3 COLLATE NOCASE, 8 COLLATE NOCASE`, viewer.id, team, viewer.role === 'exec' ? 1 : 0);
}

export function TeamLibrary({ items, root, subteams, filters }: { items: LibraryItem[]; root: string; subteams: number[]; filters: { type: string; person: string; creator: string; meeting: string; group: string } }) {
	const key = (id: number | null) => id === null ? 'unknown' : String(id);
	const kind = (item: LibraryItem) => item.url ? 'Link' : fileKind(item.original_name);
	const options = (pairs: [string, string][]) => [...new Map(pairs).entries()].sort((a, b) => a[1].localeCompare(b[1]));
	const people = options(items.map((i) => [key(i.author_id), i.author_name ?? 'Unknown']));
	const creators = options(items.map((i) => [key(i.creator_id), i.creator_name ?? 'Unknown']));
	const meetings = options(items.map((i) => [String(i.meeting_id), i.meeting_title]));
	const types = [...new Set(items.map(kind))].sort();
	const filtered = items.filter((i) => (!filters.type || filters.type === kind(i)) && (!filters.person || filters.person === key(i.author_id)) && (!filters.creator || filters.creator === key(i.creator_id)) && (!filters.meeting || filters.meeting === String(i.meeting_id)));
	const groups = new Map<string, LibraryItem[]>();
	for (const item of filtered) {
		const group = filters.group === 'creator' ? item.creator_name ?? 'Unknown' : filters.group === 'type' ? kind(item) : '';
		groups.set(group, [...(groups.get(group) ?? []), item]);
	}
	return <section class="card team-library" id="team-library" aria-labelledby="team-library-title">
		<h2 id="team-library-title" class="section-title">Library</h2>
		{items.length ? <>
			<form method="get" action={`${root}#team-library`} class="team-library-filters">
				{subteams.map((id) => <input type="hidden" name="subteam" value={id} />)}
				<label>File type<select name="library_type"><option value="">All types</option>{types.map((v) => <option value={v} selected={filters.type === v}>{v}</option>)}</select></label>
				<label>Added by<select name="library_person"><option value="">Everyone</option>{people.map(([value, name]) => <option value={value} selected={filters.person === value}>{name}</option>)}</select></label>
				<label>Meeting creator<select name="library_creator"><option value="">Everyone</option>{creators.map(([value, name]) => <option value={value} selected={filters.creator === value}>{name}</option>)}</select></label>
				<label>Meeting<select name="library_meeting"><option value="">All meetings</option>{meetings.map(([value, name]) => <option value={value} selected={filters.meeting === value}>{name}</option>)}</select></label>
				<label>Group by<select name="library_group"><option value="">None</option><option value="creator" selected={filters.group === 'creator'}>Meeting creator</option><option value="type" selected={filters.group === 'type'}>File type</option></select></label>
				<button class="btn small">Apply</button>
			</form>
			{filtered.length ? [...groups.entries()].map(([label, group]) => <div class="team-library-group">
				{label && <h3>{label}</h3>}
				<ul class="att-list library-list">{group.map((item) => <li class="library-file">
					<span class="library-icon" aria-hidden="true">{item.url ? '↗' : kind(item) === 'PDF' ? 'PDF' : kind(item) === 'PowerPoint' ? 'P' : kind(item) === 'Word document' ? 'W' : kind(item) === 'Excel spreadsheet' ? 'X' : kind(item) === 'Audio' ? '♫' : '≡'}</span>
					<div class="library-file-info"><a href={item.url ?? `/meetings/${item.meeting_id}/files/${item.id}`} target={item.url ? '_blank' : undefined} rel={item.url ? 'noopener noreferrer' : undefined}>{item.name}</a>
						<span class="hint">{kind(item)} · Added by {item.author_name ?? 'Unknown'} · <a href={`/meetings/${item.meeting_id}?view=library`}>{item.meeting_title}</a> · Meeting created by {item.creator_name ?? 'Unknown'}</span></div>
				</li>)}</ul>
			</div>) : <p class="hint">No items match these filters.</p>}
		</> : <p class="hint">No meeting library items yet.</p>}
	</section>;
}
