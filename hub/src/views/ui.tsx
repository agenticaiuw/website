import type { Child } from 'hono/jsx';
import { dueLabel, formatDate } from '../dates';
import { renderMarkdown } from '../markdown';
import { canCompleteTask } from '../perm';
import type { Member, TaskRow, Team, Viewer } from '../types';

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: string; title: Child; sub?: Child; actions?: Child }) {
	return (
		<div class="page-head">
			<div>
				{eyebrow && <p class="eyebrow">{eyebrow}</p>}
				<h1>{title}</h1>
				{sub && <p class="sub">{sub}</p>}
			</div>
			{actions && <div class="actions">{actions}</div>}
		</div>
	);
}

export function Due({ task, today }: { task: Pick<TaskRow, 'due_date' | 'status'>; today: string }) {
	if (task.status !== 'open') {
		return <span class={`pill ${task.status}`}>{task.status === 'done' ? 'Done' : 'Dropped'}</span>;
	}
	const d = dueLabel(task.due_date, today);
	return (
		<span class={`pill ${d.tone}`} title={formatDate(task.due_date, today)}>
			{d.text}
		</span>
	);
}

export function Empty({ children }: { children: Child }) {
	return <p class="empty">{children}</p>;
}

export function Markdown({ text, empty }: { text: string; empty?: string }) {
	if (!text.trim()) return empty ? <Empty>{empty}</Empty> : null;
	return <div class="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

/** A one-button form. `back` is where to land afterwards. */
export function PostButton({ action, label, cls = 'btn', back, confirm, name, value }: { action: string; label: Child; cls?: string; back?: string; confirm?: string; name?: string; value?: string }) {
	return (
		<form method="post" action={action} class="inline" data-confirm={confirm}>
			{back && <input type="hidden" name="back" value={back} />}
			{name && <input type="hidden" name={name} value={value ?? ''} />}
			<button class={cls}>{label}</button>
		</form>
	);
}

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

export function TaskList({
	tasks,
	today,
	viewer,
	show = ['assignee', 'team'],
	back,
	empty,
	groups,
	by = 'title'
}: {
	tasks: TaskRow[];
	today: string;
	viewer: Viewer;
	show?: ('assignee' | 'team' | 'meeting')[];
	back: string;
	empty?: Child;
	/** When given, a shared task shows once, with everyone's progress. */
	groups?: GroupStats;
	/** 'assignee' names each row by person, for the copies of one shared task. */
	by?: 'title' | 'assignee';
}) {
	if (!tasks.length) return <Empty>{empty ?? 'Nothing here.'}</Empty>;
	const rows = groups ? collapseTasks(tasks, viewer.id) : tasks.map((t) => ({ task: t, copies: [t] }));
	return (
		<ul class="tasks">
			{rows.map(({ task: t, copies }) => {
				const shared = copies.length > 1;
				const stats = shared ? (groups?.get(t.group_id!) ?? { total: copies.length, done: 0 }) : null;
				const open = copies.find((x) => x.status === 'open');
				const meta = [
					stats ? `${stats.done} of ${stats.total} done` : show.includes('assignee') && by === 'title' && (t.assignee_id === viewer.id ? 'You' : t.assignee_name),
					show.includes('team') && t.team_name,
					show.includes('meeting') && t.meeting_title && `From ${t.meeting_title}`
				].filter(Boolean);
				return (
					<li class={`task ${open ? 'open' : t.status}`}>
						{stats ? <Ring {...stats} /> : <Tick task={t} viewer={viewer} back={back} />}
						<div class="task-main">
							<a href={`/tasks/${t.id}${stats && t.assignee_id !== viewer.id ? '?all=1' : ''}`} class="task-title">
								{by === 'assignee' ? (t.assignee_id === viewer.id ? 'You' : t.assignee_name) : t.title}
							</a>
							{meta.length > 0 && (
								<div class="task-meta">
									{meta.map((m) => (
										<span>{m}</span>
									))}
								</div>
							)}
						</div>
						{open && <Due task={open} today={today} />}
					</li>
				);
			})}
		</ul>
	);
}

function Ring({ done, total }: { done: number; total: number }) {
	const label = `${done} of ${total} done`;
	return <span class="ring" style={`--p:${total ? Math.round((100 * done) / total) : 0}%`} role="img" aria-label={label} title={label}></span>;
}

/** The round control at the start of a task row: a button for whoever may finish it, a marker for everyone else. */
function Tick({ task, viewer, back }: { task: TaskRow; viewer: Viewer; back: string }) {
	if (task.status !== 'open') return <span class="tick on" title={task.status === 'done' ? 'Done' : 'Dropped'}></span>;
	if (!canCompleteTask(viewer, task)) return <span class="tick" title="Only the assignee or whoever assigned it can mark it done"></span>;
	return (
		<form method="post" action={`/tasks/${task.id}/status`} class="inline">
			<input type="hidden" name="back" value={back} />
			<input type="hidden" name="status" value="done" />
			<button class="tick" title="Mark done" aria-label={`Mark “${task.title}” done`}></button>
		</form>
	);
}

/** Links that act as one control, e.g. status or team filters. `href` builds each option's URL. */
export function Tabs<T extends string | number>({ options, current, href, label }: { options: [T | null, string][]; current: T | null; href: (value: T | null) => string; label: string }) {
	return (
		<nav class="seg" aria-label={label}>
			{options.map(([value, text]) => (
				<a href={href(value)} aria-current={value === current ? 'page' : undefined}>
					{text}
				</a>
			))}
		</nav>
	);
}

/** Radio buttons drawn as one segmented control. */
export function Choice({ name, options, selected, label, hint }: { name: string; options: [string, string][]; selected: string; label: string; hint?: Child }) {
	return (
		<fieldset class="field">
			<legend class="label">{label}</legend>
			<div class="seg full">
				{options.map(([value, text]) => (
					<label>
						<input type="radio" name={name} value={value} checked={value === selected} />
						<span>{text}</span>
					</label>
				))}
			</div>
			{hint && <span class="hint">{hint}</span>}
		</fieldset>
	);
}

/** A "⋯" button that opens a small panel of actions. */
export function Menu({ label, children, form }: { label: string; children: Child; form?: boolean }) {
	return (
		<details class="menu">
			<summary class="icon-btn" aria-label={label} title={label}>
				⋯
			</summary>
			<div class={`menu-panel${form ? ' form' : ''}`}>{children}</div>
		</details>
	);
}

export function MemberSelect({ name, members, selected, required, blank, id, label }: { name: string; members: Pick<Member, 'id' | 'name'>[]; selected?: number | null; required?: boolean; blank?: string; id?: string; label?: string }) {
	return (
		<select name={name} id={id} required={required} aria-label={label}>
			{blank !== undefined && <option value="">{blank}</option>}
			{members.map((m) => (
				<option value={String(m.id)} selected={m.id === selected}>
					{m.name}
				</option>
			))}
		</select>
	);
}

export function TeamSelect({ name, teams, selected, required, blank, id, label }: { name: string; teams: Pick<Team, 'id' | 'name'>[]; selected?: number | null; required?: boolean; blank?: string; id?: string; label?: string }) {
	return (
		<select name={name} id={id} required={required} aria-label={label}>
			{blank !== undefined && <option value="">{blank}</option>}
			{teams.map((t) => (
				<option value={String(t.id)} selected={t.id === selected}>
					{t.name}
				</option>
			))}
		</select>
	);
}

export function Field({ label, hint, children, wide }: { label: string; hint?: Child; children: Child; wide?: boolean }) {
	return (
		<label class={`field${wide ? ' wide' : ''}`}>
			<span class="label">{label}</span>
			{children}
			{hint && <span class="hint">{hint}</span>}
		</label>
	);
}

export function Stat({ value, label, tone }: { value: Child; label: string; tone?: string }) {
	return (
		<div class={`stat${tone ? ' ' + tone : ''}`}>
			<span class="stat-value">{value}</span>
			<span class="stat-label">{label}</span>
		</div>
	);
}

export const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');
