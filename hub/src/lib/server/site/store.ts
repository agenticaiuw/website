// Public website content: every save is a new row, so the full history of who changed
// what is kept. The newest row per section is what the site shows; a section nobody
// has edited yet shows the original site text from defaults.json.
import { all, first, run } from '../db';
import DEFAULTS from './defaults';
import { type Field, type Section, SECTIONS, sectionByKey } from './schema';

type Data = Record<string, unknown>;
const defaults = DEFAULTS as unknown as Record<string, Data>;

export type VersionRow = {
	id: number;
	section: string;
	data: string;
	edited_by: number | null;
	edited_at: string;
	note: string;
	restored_from: number | null;
	name: string | null;
};

export const defaultsFor = (key: string): Data => structuredClone(defaults[key] ?? {});

/** Stored data with any field added to the schema since it was saved filled from the defaults. */
const withDefaults = (key: string, data: Data): Data => ({ ...defaultsFor(key), ...data });

const LATEST = `SELECT v.*, m.name FROM site_content_versions v LEFT JOIN members m ON m.id = v.edited_by
	WHERE v.id IN (SELECT MAX(id) FROM site_content_versions GROUP BY section)`;

export async function latestRows(db: D1Database) {
	const rows = await all<VersionRow>(db, LATEST);
	return new Map(rows.map((r) => [r.section, r]));
}

/** Everything the website needs, newest version of each section. */
export async function siteContent(db: D1Database) {
	const latest = await latestRows(db);
	const sections: Record<string, Data> = {};
	for (const s of SECTIONS) {
		const row = latest.get(s.key);
		sections[s.key] = row ? withDefaults(s.key, JSON.parse(row.data)) : defaultsFor(s.key);
	}
	let version = 0;
	let updatedAt: string | null = null;
	for (const r of latest.values()) {
		if (r.id > version) version = r.id;
		if (!updatedAt || r.edited_at > updatedAt) updatedAt = r.edited_at;
	}
	return { version, updatedAt, sections };
}

/** A project team as the website shows it: its head (the exec on it) and its leads. */
export type HubTeam = { id: number; name: string; heads: string[]; leads: { name: string; title: string }[] };

export async function hubTeams(db: D1Database): Promise<HubTeam[]> {
	const [teams, people] = await Promise.all([
		all<{ id: number; name: string }>(db, "SELECT id, name FROM teams WHERE kind = 'project' AND archived = 0 ORDER BY name"),
		all<{ team_id: number; name: string; title: string; role: string; is_lead: number }>(
			db,
			`SELECT tm.team_id, m.name, tm.title, m.role, tm.is_lead FROM team_members tm JOIN members m ON m.id = tm.member_id
			 WHERE m.active = 1 AND (m.role = 'exec' OR tm.is_lead = 1) ORDER BY m.name`
		)
	]);
	return teams.map((t) => {
		const mine = people.filter((p) => p.team_id === t.id);
		return {
			...t,
			heads: mine.filter((p) => p.role === 'exec').map((p) => p.name),
			leads: mine.filter((p) => p.role !== 'exec' && p.is_lead).map((p) => ({ name: p.name, title: p.title }))
		};
	});
}

/** Every team's name by id, archived ones too, for reading old versions in the history. */
export async function teamNames(db: D1Database): Promise<TeamNames> {
	const rows = await all<{ id: number; name: string }>(db, 'SELECT id, name FROM teams');
	return new Map(rows.map((r) => [r.id, r.name]));
}

const plain = (s: unknown) => String(s ?? '').trim().toLowerCase();

/**
 * Fills each website team with its hub team's head and leads. A team saved before teams were
 * linked (no id) is matched by name, so the site never loses its heads.
 */
export function withHubTeams(section: Data, teams: HubTeam[]): Data {
	const byId = new Map(teams.map((t) => [t.id, t]));
	const items = ((section.items as Data[]) ?? []).map((item) => {
		const hub =
			byId.get(Number(item.team)) ??
			teams.find((t) => [item.short, item.name, plain(item.name).replace(/ (team|agent)$/, '')].some((n) => plain(n) === plain(t.name)));
		const { lead: _old, ...rest } = item;
		return { ...rest, team: hub?.id ?? null, heads: hub?.heads ?? [], leads: hub?.leads ?? [] };
	});
	return { ...section, items };
}

export async function sectionData(db: D1Database, key: string) {
	const row = await first<VersionRow>(db, 'SELECT v.*, m.name FROM site_content_versions v LEFT JOIN members m ON m.id = v.edited_by WHERE v.section = ? ORDER BY v.id DESC LIMIT 1', key);
	return { row, data: row ? withDefaults(key, JSON.parse(row.data)) : defaultsFor(key) };
}

export function versionById(db: D1Database, id: number) {
	return first<VersionRow & { prev: string | null }>(
		db,
		`SELECT v.*, m.name,
			(SELECT p.data FROM site_content_versions p WHERE p.section = v.section AND p.id < v.id ORDER BY p.id DESC LIMIT 1) AS prev
		 FROM site_content_versions v LEFT JOIN members m ON m.id = v.edited_by WHERE v.id = ?`,
		id
	);
}

/** Newest first, each with the version before it so the change can be shown. */
export function history(db: D1Database, opts: { section?: string; before?: number; limit: number }) {
	return all<VersionRow & { prev: string | null }>(
		db,
		`SELECT v.*, m.name,
			(SELECT p.data FROM site_content_versions p WHERE p.section = v.section AND p.id < v.id ORDER BY p.id DESC LIMIT 1) AS prev
		 FROM site_content_versions v LEFT JOIN members m ON m.id = v.edited_by
		 WHERE (?1 IS NULL OR v.section = ?1) AND (?2 IS NULL OR v.id < ?2)
		 ORDER BY v.id DESC LIMIT ?3`,
		opts.section ?? null,
		opts.before ?? null,
		opts.limit
	);
}

/** Saves a new version unless nothing changed. Returns the new version's id. */
export async function saveSection(db: D1Database, key: string, data: Data, memberId: number, note: string, restoredFrom: number | null = null) {
	const current = await sectionData(db, key);
	if (JSON.stringify(current.data) === JSON.stringify(data)) return null;
	const res = await run(
		db,
		'INSERT INTO site_content_versions (section, data, edited_by, note, restored_from) VALUES (?, ?, ?, ?, ?)',
		key,
		JSON.stringify(data),
		memberId,
		note,
		restoredFrom
	);
	return Number(res.meta.last_row_id);
}

// ---------- checking what the editor sends ----------

const MAX: Record<string, number> = { text: 400, url: 1000, date: 10, long: 6000, rich: 6000 };
const MAX_ITEMS = 80;

/** Links may be web, email, on-site or a {{social:…}} style placeholder. Never javascript: and the like. */
export const okHref = (s: string) => /^(https?:\/\/|mailto:|\/(?!\/)|#|\{\{[a-z_]+(:[^}]+)?\}\}$)/i.test(s);

export function coerce(fields: Field[], input: unknown, errors: string[], path = ''): Data {
	const src = input && typeof input === 'object' && !Array.isArray(input) ? (input as Data) : {};
	const out: Data = {};
	for (const f of fields) {
		const label = path ? `${path} › ${f.label}` : f.label;
		const v = src[f.k];
		switch (f.t) {
			case 'number': {
				const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
				if (String(v ?? '').trim() === '' || !Number.isFinite(n)) errors.push(`${label}: enter a number.`);
				out[f.k] = Number.isFinite(n) ? n : 0;
				break;
			}
			case 'bool':
				out[f.k] = v === true || v === 'true' || v === 'on' || v === '1';
				break;
			case 'team': {
				const n = Number(v);
				out[f.k] = Number.isInteger(n) && n > 0 ? n : null;
				if (out[f.k] === null) errors.push(`${label}: choose a team.`);
				break;
			}
			case 'group':
				out[f.k] = coerce(f.fields, v, errors, label);
				break;
			case 'list': {
				const items = Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
				out[f.k] = items.map((item, i) => {
					const title = item && typeof item === 'object' && f.title ? String((item as Data)[f.title] ?? '').trim() : '';
					return coerce(f.fields, item, errors, `${label} › ${title || `${cap(f.item)} ${i + 1}`}`);
				});
				break;
			}
			case 'strings':
				out[f.k] = (Array.isArray(v) ? v : [])
					.map((s) => clean(String(s ?? ''), MAX.text))
					.filter(Boolean)
					.slice(0, MAX_ITEMS);
				break;
			default: {
				const s = clean(typeof v === 'string' || typeof v === 'number' ? String(v) : '', MAX[f.t]);
				if (!s && !f.optional) errors.push(`${label}: can’t be empty.`);
				else if (s && f.t === 'url' && !okHref(s)) errors.push(`${label}: use a link starting with https://, mailto: or /.`);
				else if (s && f.t === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors.push(`${label}: use a valid date.`);
				out[f.k] = s;
			}
		}
	}
	return out;
}

const clean = (s: string, max: number) => s.replace(/\r\n?/g, '\n').trim().slice(0, max);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- describing a change ----------

export type Change = { label: string; before: string; after: string };

/** Hub team names by id, so a change of team reads as names in the history. */
export type TeamNames = Map<number, string>;

/** Field-by-field changes between two versions of a section. List items are matched by their title. */
export function diffSection(section: Section, before: Data, after: Data, teams: TeamNames = new Map()): Change[] {
	const out: Change[] = [];
	names = teams;
	diffFields(section.fields, before, after, '', out);
	return out;
}

let names: TeamNames = new Map();
const showField = (f: Field, v: unknown) => (f.t === 'team' && v != null ? names.get(Number(v)) ?? `Team ${v}` : show(v));
const show = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v == null ? '' : String(v));

function diffFields(fields: Field[], a: Data, b: Data, path: string, out: Change[]) {
	for (const f of fields) {
		const label = path ? `${path} › ${f.label}` : f.label;
		const x = a?.[f.k];
		const y = b?.[f.k];
		if (f.t === 'group') diffFields(f.fields, (x as Data) ?? {}, (y as Data) ?? {}, label, out);
		else if (f.t === 'list') diffList(f, (x as Data[]) ?? [], (y as Data[]) ?? [], label, out);
		else if (f.t === 'strings') {
			const s = ((x as string[]) ?? []).join('\n');
			const t = ((y as string[]) ?? []).join('\n');
			if (s !== t) out.push({ label, before: s, after: t });
		} else if (showField(f, x) !== showField(f, y)) out.push({ label, before: showField(f, x), after: showField(f, y) });
	}
}

function diffList(f: Extract<Field, { t: 'list' }>, a: Data[], b: Data[], label: string, out: Change[]) {
	const titleOf = (d: Data, i: number) => (f.title && String(d?.[f.title] ?? '').trim()) || `${cap(f.item)} ${i + 1}`;
	const key = (d: Data) => (f.title ? String(d?.[f.title] ?? '').trim() : '');
	const unique = (list: Data[]) => {
		const keys = list.map(key);
		return keys.every((k, i) => k && keys.indexOf(k) === i);
	};
	const pairs: [number | null, number | null][] = [];
	const usedB = new Set<number>();
	const unmatchedA: number[] = [];
	if (f.title && unique(a) && unique(b)) {
		a.forEach((d, i) => {
			const j = b.findIndex((e) => key(e) === key(d));
			if (j >= 0) {
				pairs.push([i, j]);
				usedB.add(j);
			} else unmatchedA.push(i);
		});
	} else a.forEach((_, i) => unmatchedA.push(i));
	// Whatever is left pairs up in order, so an edited title reads as an edit.
	const restB = b.map((_, j) => j).filter((j) => !usedB.has(j));
	unmatchedA.forEach((i, n) => pairs.push([i, restB[n] ?? null]));
	restB.slice(unmatchedA.length).forEach((j) => pairs.push([null, j]));

	for (const [i, j] of pairs) {
		if (i !== null && j !== null) diffFields(f.fields, a[i], b[j], `${label} › ${titleOf(b[j], j)}`, out);
		else if (j !== null) out.push({ label: `${label} › Added ${f.item}`, before: '', after: summary(f.fields, b[j]) });
		else if (i !== null) out.push({ label: `${label} › Removed ${f.item}`, before: summary(f.fields, a[i]), after: '' });
	}
	const order = (list: Data[]) => list.map(key).filter((k) => a.some((d) => key(d) === k) && b.some((d) => key(d) === k));
	if (f.title && unique(a) && unique(b) && order(a).join('\u0000') !== order(b).join('\u0000')) {
		out.push({ label: `${label} › Order`, before: a.map((d, i) => titleOf(d, i)).join('\n'), after: b.map((d, i) => titleOf(d, i)).join('\n') });
	}
}

/** One item written out as "Label: value" lines, for added and removed list items. */
function summary(fields: Field[], d: Data): string {
	const lines: string[] = [];
	for (const f of fields) {
		const v = d?.[f.k];
		if (f.t === 'group') lines.push(summary(f.fields, (v as Data) ?? {}));
		else if (f.t === 'list') for (const item of (v as Data[]) ?? []) lines.push(`${f.label}: ${summary(f.fields, item).replace(/\n/g, ', ')}`);
		else if (f.t === 'strings') lines.push(`${f.label}: ${((v as string[]) ?? []).join(', ')}`);
		else if (showField(f, v)) lines.push(`${f.label}: ${showField(f, v)}`);
	}
	return lines.filter(Boolean).join('\n');
}

/** Word-level difference for showing what changed inside a block of text. */
export function wordDiff(a: string, b: string): { t: 'same' | 'del' | 'ins'; s: string }[] {
	const x = a.split(/(\s+)/);
	const y = b.split(/(\s+)/);
	if (x.length * y.length > 400_000) return [{ t: 'del', s: a }, { t: 'ins', s: b }];
	const n = x.length;
	const m = y.length;
	const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const out: { t: 'same' | 'del' | 'ins'; s: string }[] = [];
	const push = (t: 'same' | 'del' | 'ins', s: string) => {
		const last = out[out.length - 1];
		if (last && last.t === t) last.s += s;
		else out.push({ t, s });
	};
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (x[i] === y[j]) push('same', x[i++]), j++;
		else if (L[i + 1][j] >= L[i][j + 1]) push('del', x[i++]);
		else push('ins', y[j++]);
	}
	while (i < n) push('del', x[i++]);
	while (j < m) push('ins', y[j++]);
	return out;
}

export { sectionByKey, SECTIONS };
