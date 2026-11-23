// The Files page: the club's files, for the whole club or for one team, stored in D1 in 1 MiB parts.
// A team's files are seen by its members and execs; Exec Board files by execs only.
import { all, first } from './db.ts';
import { FILE_PART } from './meeting-content.ts';
import type { Viewer } from '../types.ts';

/** All the library's files together, removed ones included, stay under this. */
export const FILES_BUDGET = 1024 * FILE_PART;

/** Files other pages link to by key. They show in the library but can't be removed from it. */
const FIXED = new Set(['constitution']);

export type ClubFile = {
	key: string;
	name: string;
	media_type: string;
	size: number;
	updated_at: string;
	team_id: number | null;
	team_name: string | null;
	team_kind: 'exec' | 'project' | null;
	uploaded_by: number | null;
	uploader: string | null;
	removed_at: string;
	remover: string | null;
};

export type Place = { id: number | null; name: string; kind: 'exec' | 'project' | null };

const isExec = (v: Viewer) => v.role === 'exec';

export const canSeeFile = (v: Viewer, f: Pick<ClubFile, 'team_id' | 'team_kind'>) =>
	f.team_id === null || isExec(v) || (f.team_kind === 'project' && v.teamIds.has(f.team_id));

/** Execs, whoever added it, and the leads of the team it's for. */
export const canRemoveFile = (v: Viewer, f: Pick<ClubFile, 'key' | 'team_id' | 'uploaded_by'>) =>
	!FIXED.has(f.key) && (isExec(v) || f.uploaded_by === v.id || (f.team_id !== null && v.leadOf.has(f.team_id)));

/** Where this person can add files: execs anywhere, everyone else on their own active teams. */
export async function uploadPlaces(db: D1Database, v: Viewer): Promise<Place[]> {
	const teams = await all<{ id: number; name: string; kind: 'exec' | 'project' }>(db, 'SELECT id, name, kind FROM teams WHERE archived = 0 ORDER BY kind, name COLLATE NOCASE');
	const club: Place = { id: null, name: 'Whole club', kind: null };
	return isExec(v) ? [club, ...teams] : teams.filter((t) => t.kind === 'project' && v.teamIds.has(t.id));
}

const SELECT = `SELECT f.key, f.name, f.media_type, f.size, f.updated_at, f.team_id, t.name AS team_name, t.kind AS team_kind, f.uploaded_by,
	up.name AS uploader, f.removed_at, rm.name AS remover
	FROM club_files f LEFT JOIN teams t ON t.id = f.team_id LEFT JOIN members up ON up.id = f.uploaded_by LEFT JOIN members rm ON rm.id = f.removed_by`;

/** The files this person can see, grouped by place: the whole club first, then teams by name. */
export async function visibleFiles(db: D1Database, v: Viewer) {
	const rows = (await all<ClubFile>(db, `${SELECT} WHERE f.removed_at = '' ORDER BY t.name COLLATE NOCASE, f.name COLLATE NOCASE`)).filter((f) => canSeeFile(v, f));
	const groups = new Map<string, { place: Place; files: ClubFile[] }>();
	for (const f of rows) {
		const k = f.team_id === null ? 'club' : String(f.team_id);
		if (!groups.has(k)) groups.set(k, { place: { id: f.team_id, name: f.team_name ?? 'Whole club', kind: f.team_kind }, files: [] });
		groups.get(k)!.files.push(f);
	}
	return [...groups.values()].sort((a, b) => (a.place.id === null ? -1 : b.place.id === null ? 1 : 0));
}

/** Removed files, newest first, for execs to put back. */
export const removedFiles = (db: D1Database) => all<ClubFile>(db, `${SELECT} WHERE f.removed_at <> '' ORDER BY f.removed_at DESC LIMIT 100`);

export const fileByKey = (db: D1Database, key: string) => first<ClubFile>(db, `${SELECT} WHERE f.key = ?`, key);

/**
 * The writes that add these files to one place, in one batch: nothing is added if the library
 * would go over its budget. Returns the statements; the first one's changes say whether it worked.
 */
export function addFiles(db: D1Database, v: Pick<Viewer, 'id'> | null, team: number | null, files: { name: string; type: string; bytes: ArrayBuffer }[]) {
	const total = files.reduce((sum, f) => sum + f.bytes.byteLength, 0);
	const keys = files.map(() => crypto.randomUUID());
	const writes: D1PreparedStatement[] = [];
	for (const [i, f] of files.entries()) {
		writes.push(
			db
				.prepare(
					`INSERT INTO club_files (key, name, media_type, size, team_id, uploaded_by)
					 SELECT ?1, ?2, ?3, ?4, ?5, ?6
					 WHERE (?1 <> ?9 OR (SELECT COALESCE(SUM(size), 0) FROM club_files) + ?7 <= ?8)
					 AND (?1 = ?9 OR EXISTS (SELECT 1 FROM club_files WHERE key = ?9))`
				)
				.bind(keys[i], f.name, f.type, f.bytes.byteLength, team, v?.id ?? null, total, FILES_BUDGET, keys[0])
		);
		for (let offset = 0; offset < f.bytes.byteLength; offset += FILE_PART) {
			writes.push(
				db
					.prepare('INSERT INTO club_file_chunks (file_key, part, data) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM club_files WHERE key = ?1)')
					.bind(keys[i], offset / FILE_PART, f.bytes.slice(offset, offset + FILE_PART))
			);
		}
	}
	return writes;
}

/** The file's bytes, put back together from its parts, or null if a part is missing. */
export async function fileBytes(db: D1Database, key: string, size: number) {
	const chunks = await all<{ data: number[] | ArrayBuffer }>(db, 'SELECT data FROM club_file_chunks WHERE file_key = ? ORDER BY part', key);
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const { data } of chunks) {
		const part = data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);
		if (offset + part.length > size) return null;
		bytes.set(part, offset);
		offset += part.length;
	}
	return offset === size ? bytes : null;
}

/** A Content-Disposition filename that works for any name. */
export const dispositionName = (name: string) => encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16));
