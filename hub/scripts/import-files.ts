// Adds a folder of files to the hub's Files page, for moving the club's Google Drive into the hub.
//
//   node --experimental-strip-types scripts/import-files.ts <folder> [--remote]
//
// <folder> holds one folder per place, named "Whole club" or a team's name exactly as the hub shows
// it ("Exec Board", "Business", "Automation", ...), with the files inside. Only letters and numbers
// count, so "Design - Product" is the Design / Product team (a folder name can't have a slash). A file already on the
// Files page in that place under the same name is skipped, so it's safe to run again.
// Each file's bytes go to the R2 bucket, its name and place to D1. Without --remote it writes to the
// local copies of both.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { meetingFileType } from '../src/lib/server/meeting-content.ts';
import { FILES_BUDGET, UPLOAD_LIMIT } from '../src/lib/server/files.ts';

const [folder] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const remote = process.argv.includes('--remote');
if (!folder) {
	console.error('Usage: node --experimental-strip-types scripts/import-files.ts <folder> [--remote]');
	process.exit(1);
}

const where = remote ? '--remote' : '--local';
function query<T>(sql: string): T[] {
	const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'agenticaiuw-hub', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
	return (JSON.parse(out) as { results: T[] }[]).flatMap((r) => r.results);
}
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const teams = query<{ id: number; name: string }>('SELECT id, name FROM teams');
const existing = new Set(query<{ team_id: number | null; name: string }>("SELECT team_id, name FROM club_files WHERE removed_at = ''").map((f) => `${f.team_id ?? 'club'}/${f.name.toLowerCase()}`));
let used = query<{ n: number }>('SELECT COALESCE(SUM(size), 0) AS n FROM club_files')[0].n;

const BUCKET = 'agenticaiuw-hub-files';
const statements: string[] = [];
let problems = 0;

for (const place of readdirSync(folder).sort()) {
	const dir = join(folder, place);
	if (!statSync(dir).isDirectory()) continue;
	const team = plain(place) === 'wholeclub' ? null : teams.find((t) => plain(t.name) === plain(place));
	if (team === undefined) {
		console.log(`not a place in the hub: ${place} (use "Whole club" or a team name)`);
		problems++;
		continue;
	}
	const teamId = team === null ? null : team.id;
	for (const name of readdirSync(dir).sort()) {
		const path = join(dir, name);
		if (name.startsWith('.') || !statSync(path).isFile()) continue;
		if (existing.has(`${teamId ?? 'club'}/${name.toLowerCase()}`)) {
			console.log(`already there: ${place}/${name}`);
			continue;
		}
		const bytes = readFileSync(path);
		const type = meetingFileType(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), UPLOAD_LIMIT);
		if (!type) {
			console.log(`refused: ${place}/${name} (${bytes.length > UPLOAD_LIMIT ? 'over 32 MiB' : 'not a PDF, Office, text, image or audio file'})`);
			problems++;
			continue;
		}
		if (used + bytes.length > FILES_BUDGET) {
			console.log(`refused: ${place}/${name} (the Files page is full)`);
			problems++;
			continue;
		}
		used += bytes.length;
		const key = crypto.randomUUID();
		execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, where, '--file', path, '--content-type', type], { stdio: ['ignore', 'ignore', 'inherit'] });
		statements.push(`INSERT INTO club_files (key, name, media_type, size, team_id) VALUES (${quote(key)}, ${quote(name)}, ${quote(type)}, ${bytes.length}, ${teamId ?? 'NULL'});`);
		console.log(`adding: ${place}/${name}`);
	}
}

if (statements.length) {
	const tmp = mkdtempSync(join(tmpdir(), 'hub-files-'));
	try {
		const file = join(tmp, 'import.sql');
		writeFileSync(file, statements.join('\n'));
		execFileSync('npx', ['wrangler', 'd1', 'execute', 'agenticaiuw-hub', where, '--yes', '--file', file], { stdio: ['ignore', 'ignore', 'inherit'] });
		console.log(`done: ${statements.length} files added ${remote ? 'to the live hub' : 'locally'}`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
} else console.log('nothing to add');
process.exit(problems ? 2 : 0);
