// Outreach: people and organizations outside the club (companies, faculty, campus offices,
// investors, other clubs). Execs and the Business team see them, on the Business team's page. Kept apart from the newsletter list: nothing here is ever
// added to the newsletter or the Google Group.
import { all, BUSINESS_TEAM, first, nowIso, run } from './db';
import { isEmail, str, type FormData } from './form';

export type Outreach = {
	id: number;
	name: string;
	organization: string;
	kind: string;
	region: string;
	email: string;
	phone: string;
	link: string;
	purpose: string;
	owner: string;
	status: string;
	priority: string;
	notes: string;
	source: string;
	created_at: string;
	updated_at: string;
};

/** The columns a form can set, with their longest allowed length. */
const FIELDS = {
	organization: 200,
	name: 200,
	kind: 80,
	region: 80,
	email: 200,
	phone: 60,
	link: 500,
	purpose: 500,
	owner: 100,
	status: 80,
	priority: 40,
	notes: 5000,
	source: 500
} as const;

type Field = keyof typeof FIELDS;
export type OutreachInput = Record<Field, string>;

/** The form's values, or the error key for the notice. */
export function readOutreach(form: FormData): {
	values: OutreachInput;
	error?: 'missing' | 'email';
} {
	const values = Object.fromEntries(Object.entries(FIELDS).map(([k, max]) => [k, str(form[k], max)])) as OutreachInput;
	values.email = values.email.toLowerCase();
	if (!values.organization && !values.name) return { values, error: 'missing' };
	if (values.email && !isEmail(values.email)) return { values, error: 'email' };
	return { values };
}

export type OutreachFilter = { q: string; status: string; kind: string };

export function listOutreach(db: D1Database, f: OutreachFilter) {
	const where: string[] = [];
	const args: string[] = [];
	for (const c of ['status', 'kind'] as const) {
		if (!f[c]) continue;
		where.push(`${c} = ?`);
		args.push(f[c]);
	}
	if (f.q) {
		where.push("(name || ' ' || organization || ' ' || email || ' ' || purpose || ' ' || owner || ' ' || notes) LIKE ? ESCAPE '\\'");
		args.push(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
	}
	return all<Outreach>(
		db,
		`SELECT * FROM outreach${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
		 ORDER BY CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Low' THEN 2 ELSE 3 END, (organization = ''), organization COLLATE NOCASE, name COLLATE NOCASE`,
		...args
	);
}

/** Values already in use, offered as suggestions in the form. */
export async function outreachOptions(db: D1Database) {
	const col = (c: string) => db.prepare(`SELECT DISTINCT ${c} AS v FROM outreach WHERE ${c} != ''`);
	const res = await db.batch<{ v: string }>([col('kind'), col('status'), col('priority'), col('region'), col('owner'), db.prepare('SELECT name AS v FROM members WHERE active = 1')]);
	const pick = (...i: number[]) => [...new Set(i.flatMap((n) => res[n].results.map((r) => r.v)))].sort((a, b) => a.localeCompare(b));
	return {
		kinds: pick(0),
		statuses: pick(1),
		priorities: pick(2),
		regions: pick(3),
		owners: pick(4, 5)
	};
}

export type OutreachOptions = Awaited<ReturnType<typeof outreachOptions>>;

export const outreachById = (db: D1Database, id: number) => first<Outreach>(db, 'SELECT * FROM outreach WHERE id = ?', id);

const COLUMNS = Object.keys(FIELDS) as Field[];

export async function addOutreach(db: D1Database, v: OutreachInput) {
	const row = await first<{ id: number }>(db, `INSERT INTO outreach (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')}) RETURNING id`, ...COLUMNS.map((c) => v[c]));
	return row!.id;
}

export function saveOutreach(db: D1Database, id: number, v: OutreachInput) {
	return run(db, `UPDATE outreach SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...COLUMNS.map((c) => v[c]), nowIso(), id);
}

export const deleteOutreach = (db: D1Database, id: number) => run(db, 'DELETE FROM outreach WHERE id = ?', id);

/** Shown as a link only when it is one; the column sometimes holds a name or a note instead. */
export const linkHref = (link: string) => (/^https?:\/\/\S+$/i.test(link) ? link : '');

/** The Business team's id: its page holds the contacts. */
export const businessTeamId = (db: D1Database) => db.prepare('SELECT id FROM teams WHERE name = ?').bind(BUSINESS_TEAM).first<number>('id');

/** The contacts list on the Business team's page, filtered by `contact_*` in the address. */
export async function contactsSection(db: D1Database, url: URL) {
	const filter = {
		q: str(url.searchParams.get('contact_q'), 100),
		status: str(url.searchParams.get('contact_status'), 80),
		kind: str(url.searchParams.get('contact_kind'), 80)
	};
	const [rows, options, total] = await Promise.all([listOutreach(db, filter), outreachOptions(db), db.prepare('SELECT COUNT(*) AS n FROM outreach').first<number>('n')]);
	return {
		filter,
		options,
		total: total ?? 0,
		rows: rows.map((r) => ({ id: r.id, name: r.name, organization: r.organization, kind: r.kind, email: r.email, owner: r.owner, status: r.status, priority: r.priority }))
	};
}

export type ContactsSection = Awaited<ReturnType<typeof contactsSection>>;
