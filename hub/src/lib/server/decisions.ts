import { all, first, nowIso } from './db';

/**
 * The club's rulebook. A decision is open until an exec makes it official or drops it. Every change
 * first copies what the decision said into decision_history, so nothing decided is lost.
 */
export type DecisionStatus = 'open' | 'official' | 'dropped';
export const STATUSES: DecisionStatus[] = ['official', 'open', 'dropped'];

/** One answer to an open question: picking it makes `body` the rule, or drops the question when `body` is null. */
export type DecisionOption = { label: string; body: string | null };

export type Decision = {
	id: number;
	area: string;
	title: string;
	body: string;
	context: string;
	options: DecisionOption[];
	status: DecisionStatus;
	owner_id: number | null;
	owner: string | null;
	starts_on: string;
	exec_only: number;
	sort: number;
	decided_at: string;
	decided_by_name: string | null;
	updated_at: string;
};
type Row = Omit<Decision, 'options'> & { options: string };

const SELECT = `SELECT d.id, d.area, d.title, d.body, d.context, d.options, d.status, d.owner_id, o.name AS owner, d.starts_on,
	d.exec_only, d.sort, d.decided_at, b.name AS decided_by_name, d.updated_at
	FROM decisions d LEFT JOIN members o ON o.id = d.owner_id LEFT JOIN members b ON b.id = d.decided_by`;

function parse(r: Row): Decision {
	let options: DecisionOption[] = [];
	try {
		const v: unknown = JSON.parse(r.options);
		if (Array.isArray(v))
			options = v.flatMap((x): DecisionOption[] => {
				if (typeof x === 'string') return [{ label: x, body: x }];
				if (x && typeof x === 'object' && typeof (x as DecisionOption).label === 'string') {
					const body = (x as DecisionOption).body;
					return [{ label: (x as DecisionOption).label, body: typeof body === 'string' ? body : null }];
				}
				return [];
			});
	} catch {
		// A broken list just means no choices to pick from.
	}
	return { ...r, options };
}

/** Execs get every decision; everyone else gets the official ones meant for all members. */
export async function decisions(db: D1Database, execs: boolean): Promise<Decision[]> {
	const where = execs ? '' : `WHERE d.status = 'official' AND d.exec_only = 0`;
	return (await all<Row>(db, `${SELECT} ${where} ORDER BY d.sort, d.id`)).map(parse);
}

export async function decision(db: D1Database, id: number): Promise<Decision | null> {
	const r = await first<Row>(db, `${SELECT} WHERE d.id = ?`, id);
	return r ? parse(r) : null;
}

/** Decisions grouped by area, in the order the areas first appear. */
export function byArea(list: Decision[]): [string, Decision[]][] {
	const groups = new Map<string, Decision[]>();
	for (const d of list) groups.set(d.area || 'Other', [...(groups.get(d.area || 'Other') ?? []), d]);
	return [...groups];
}

export type DecisionChange = { status: DecisionStatus; body: string; owner_id: number | null; starts_on: string };

export async function saveDecision(db: D1Database, before: Decision, next: DecisionChange, by: number) {
	const now = nowIso();
	const decided = next.status !== 'open';
	// Picking it again keeps who decided it first and when.
	const keep = decided && before.status === next.status && before.body === next.body && before.decided_at;
	await db.batch([
		db
			.prepare('INSERT INTO decision_history (decision_id, status, body, owner_id, starts_on, changed_by) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(before.id, before.status, before.body, before.owner_id, before.starts_on, by),
		db
			.prepare(
				`UPDATE decisions SET status = ?, body = ?, owner_id = ?, starts_on = ?, updated_at = ?,
				decided_by = ${keep ? 'decided_by' : '?'}, decided_at = ${keep ? 'decided_at' : '?'} WHERE id = ?`
			)
			.bind(next.status, next.body, next.owner_id, next.starts_on, now, ...(keep ? [] : [decided ? by : null, decided ? now : '']), before.id)
	]);
}

export type NewDecision = { area: string; title: string; body: string; status: DecisionStatus; owner_id: number | null; starts_on: string; exec_only: boolean };

export async function addDecision(db: D1Database, d: NewDecision, by: number) {
	const now = nowIso();
	const official = d.status === 'official';
	// New decisions go at the end of their area, or at the very end for a new area.
	const after = await first<{ sort: number }>(
		db,
		'SELECT COALESCE((SELECT MAX(sort) FROM decisions WHERE area = ?), (SELECT MAX(sort) FROM decisions), 0) AS sort',
		d.area
	);
	const sort = (after?.sort ?? 0) + 1;
	await db
		.prepare(
			`INSERT INTO decisions (area, title, body, status, owner_id, starts_on, exec_only, sort, decided_by, decided_at, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(d.area, d.title, d.body, d.status, d.owner_id, d.starts_on, d.exec_only ? 1 : 0, sort, official ? by : null, official ? now : '', by)
		.run();
}

/** A YYYY-MM-DD date, or '' for none. Anything else is null. */
export function dateOrBlank(s: string): string | null {
	if (!s) return '';
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) ? s : null;
}
