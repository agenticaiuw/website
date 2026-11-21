import type { TaskRow } from './types.ts';

/** Done/total for tasks assigned to several people, keyed by group_id. */
export type GroupStats = Map<number, { total: number; done: number }>;

/**
 * Folds copies of one shared task into a single entry. Only copies that are both in the
 * list fold, so a filtered list (one person's tasks) still shows plain rows.
 */
export function collapseTasks(tasks: TaskRow[], viewerId: number) {
	const byGroup = new Map<number, TaskRow[]>();
	for (const t of tasks) if (t.group_id) byGroup.set(t.group_id, [...(byGroup.get(t.group_id) ?? []), t]);
	const out: { task: TaskRow; copies: TaskRow[] }[] = [];
	for (const t of tasks) {
		const copies = t.group_id ? byGroup.get(t.group_id)! : [t];
		if (copies.length < 2) out.push({ task: t, copies: [t] });
		// One entry per group, at the first copy's place; it links to the viewer's own copy if they have one.
		else if (copies[0] === t) out.push({ task: copies.find((x) => x.assignee_id === viewerId) ?? t, copies });
	}
	return out;
}

export type Named = { name: string; email?: string };

/** Two people with the same name are impossible to tell apart, so anyone who shares a name in a list gets their NetID too. */
export function netIds(people: Named[]) {
	const count = new Map<string, number>();
	for (const p of people) count.set(p.name.trim().toLowerCase(), (count.get(p.name.trim().toLowerCase()) ?? 0) + 1);
	return (p: Named) => (p.email && (count.get(p.name.trim().toLowerCase()) ?? 0) > 1 ? p.email.split('@')[0] : '');
}

export const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

export const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('');
