// The Files page: the club's files, for the whole club or for one team. The bytes are in R2 (FILES),
// each under its club_files.key; the names, places and who added them are in D1.
// A team's files are seen by its members and execs; Exec Board files by execs only.
import { all, first } from './db.ts';
import type { Env, Viewer } from '../types.ts';

const MiB = 1024 * 1024;
/** One upload, all its files together. */
export const UPLOAD_LIMIT = 32 * MiB;
/** All the library's files together, removed ones included: half of R2's free 10 GB. */
export const FILES_BUDGET = 5 * 1024 * MiB;

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

/** Adds these files to one place: bytes to R2, then their rows. False if the library would go over its budget. */
export async function addFiles(env: Pick<Env, 'DB' | 'FILES'>, uploader: number | null, team: number | null, files: { name: string; type: string; bytes: ArrayBuffer }[]) {
	const total = files.reduce((sum, f) => sum + f.bytes.byteLength, 0);
	const used = (await first<{ n: number }>(env.DB, 'SELECT COALESCE(SUM(size), 0) AS n FROM club_files'))?.n ?? 0;
	if (used + total > FILES_BUDGET) return false;
	const keys = files.map(() => crypto.randomUUID());
	await Promise.all(files.map((f, i) => env.FILES.put(keys[i], f.bytes, { httpMetadata: { contentType: f.type } })));
	try {
		await env.DB.batch(
			files.map((f, i) =>
				env.DB.prepare('INSERT INTO club_files (key, name, media_type, size, team_id, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)').bind(keys[i], f.name, f.type, f.bytes.byteLength, team, uploader)
			)
		);
	} catch (e) {
		await env.FILES.delete(keys);
		throw e;
	}
	return true;
}

/** A download of the file's bytes from R2, or a 500 if they're missing. */
export async function fileResponse(env: Pick<Env, 'FILES'>, file: Pick<ClubFile, 'key' | 'name' | 'media_type'>) {
	const object = await env.FILES.get(file.key);
	if (!object) return new Response('File unavailable.', { status: 500 });
	return new Response(object.body, {
		headers: {
			'Content-Type': file.media_type,
			'Content-Length': String(object.size),
			'Content-Disposition': `attachment; filename*=UTF-8''${dispositionName(file.name)}`,
			'Content-Security-Policy': "sandbox; default-src 'none'"
		}
	});
}

/** A Content-Disposition filename that works for any name. */
export const dispositionName = (name: string) => encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16));
