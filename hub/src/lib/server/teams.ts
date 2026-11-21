import { isExec } from '../perm';
import type { LibraryItem, RosterMember, Subteam, Viewer } from '../types';
import { all, first, MEETING_VISIBLE } from './db';

export function teamRoster(db: D1Database, team: number) {
	return all<RosterMember>(
		db,
		`SELECT m.id, m.name, m.email, m.role, m.available_hours, tm.is_lead, tm.title, tm.can_manage_page
	 FROM team_members tm JOIN members m ON m.id = tm.member_id
	 WHERE tm.team_id = ? AND m.active = 1 ORDER BY m.role = 'exec' DESC, tm.is_lead DESC, tm.title = '', m.name COLLATE NOCASE`,
		team
	);
}

export function teamSubteams(db: D1Database, team: number) {
	return all<Subteam>(db, 'SELECT * FROM subteams WHERE team_id = ? ORDER BY archived, name COLLATE NOCASE', team);
}

/** Execs, and anyone an exec gave page access on this team. */
export async function canManagePage(db: D1Database, viewer: Viewer, team: number) {
	return isExec(viewer) || !!(await first(db, 'SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ? AND can_manage_page = 1', team, viewer.id));
}

/** Files and links from the team's meetings that the viewer can see. */
export function teamLibrary(db: D1Database, viewer: Viewer, team: number) {
	const access = `(?3 = 1 OR m.created_by = ?1 OR ${MEETING_VISIBLE} OR EXISTS (
		SELECT 1 FROM team_members lead JOIN meeting_teams mt ON mt.team_id = lead.team_id
		WHERE mt.meeting_id = m.id AND lead.member_id = ?1 AND lead.is_lead = 1))`;
	const teamMatch = `(m.team_id = ?2 OR EXISTS (SELECT 1 FROM meeting_teams mt WHERE mt.meeting_id = m.id AND mt.team_id = ?2))`;
	return all<LibraryItem>(
		db,
		`SELECT f.id, m.id AS meeting_id, m.title AS meeting_title, m.created_by AS creator_id, creator.name AS creator_name,
		f.author_id, author.name AS author_name, COALESCE(f.display_name, f.name) AS name, f.name AS original_name, NULL AS url
		FROM meeting_attachments f JOIN meetings m ON m.id = f.meeting_id LEFT JOIN members creator ON creator.id = m.created_by
		LEFT JOIN members author ON author.id = f.author_id WHERE f.removed = 0 AND ${teamMatch} AND ${access}
		UNION ALL
		SELECT l.id, m.id, m.title, m.created_by, creator.name, l.author_id, author.name, l.name, l.name, l.url
		FROM meeting_library_links l JOIN meetings m ON m.id = l.meeting_id LEFT JOIN members creator ON creator.id = m.created_by
		LEFT JOIN members author ON author.id = l.author_id WHERE l.removed = 0 AND ${teamMatch} AND ${access}
		ORDER BY 3 COLLATE NOCASE, 8 COLLATE NOCASE`,
		viewer.id,
		team,
		viewer.role === 'exec' ? 1 : 0
	);
}
