import type { Child } from 'hono/jsx';
import { dueLabel, formatDue, formatTime, isTime } from '../dates';
import { renderMarkdown } from '../markdown';
import { canCompleteTask, canManageTask } from '../perm';
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

export function Due({ task, today }: { task: Pick<TaskRow, 'due_date' | 'status'> & { due_time?: string }; today: string }) {
	if (task.status !== 'open') {
		return <span class={`pill ${task.status}`}>{task.status === 'done' ? 'Done' : 'Dropped'}</span>;
	}
	const d = dueLabel(task.due_date, today);
	// Due today with a time: say when.
	const text = d.tone === 'today' && isTime(task.due_time) ? `${d.text}, ${formatTime(task.due_time)}` : d.text;
	return (
		<span class={`pill ${d.tone}`} title={formatDue(task.due_date, task.due_time, today)}>
			{text}
		</span>
	);
}

export function Empty({ children }: { children: Child }) {
	return <p class="empty">{children}</p>;
}

export function MembersDialog({ id, name, count, children }: { id: string; name: string; count: number; children: Child }) {
	return (
		<div class="members-control">
			<button type="button" class="btn small" aria-haspopup="dialog" aria-controls={id} data-members-dialog={id}>
				Members ({count})
			</button>
			<dialog id={id} class="members-dialog" aria-labelledby={`${id}-title`}>
				<div class="members-dialog-content">
					<header>
						<h2 id={`${id}-title`}>{name} members</h2>
						<form method="dialog"><button class="btn small" autofocus>Close</button></form>
					</header>
					{children}
				</div>
			</dialog>
		</div>
	);
}

export function Markdown({ text, empty }: { text: string; empty?: string }) {
	if (!text.trim()) return empty ? <Empty>{empty}</Empty> : null;
	return <div class="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

/** A one-button form. `back` is where to land afterwards. */
export function PostButton({ action, label, cls = 'btn', back, confirm, name, value, removeLabel }: { action: string; label: Child; cls?: string; back?: string; confirm?: string; name?: string; value?: string; removeLabel?: string }) {
	return (
		<form method="post" action={action} class="inline" data-confirm={confirm}>
			{back && <input type="hidden" name="back" value={back} />}
			{name && <input type="hidden" name={name} value={value ?? ''} />}
			<button class={removeLabel ? 'icon-btn remove-cross' : cls} aria-label={removeLabel} title={removeLabel}>{removeLabel ? <span aria-hidden="true">×</span> : label}</button>
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
	by = 'title',
	removable = false
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
	/** With by="assignee": a button to take each person off the shared task, for those who manage it. */
	removable?: boolean;
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
						{!stats && <Stage task={t} viewer={viewer} back={back} />}
						{open && <Due task={open} today={today} />}
						{removable && by === 'assignee' && canManageTask(viewer, t) && (
							<form method="post" action={`/tasks/${t.id}/remove`} class="inline" data-confirm={`Take ${t.assignee_name} off this task? Their copy and its history are deleted; everyone else keeps theirs.`}>
								<input type="hidden" name="back" value={back} />
								<button class="icon-btn remove" title={`Take ${t.assignee_name} off this task`} aria-label={`Take ${t.assignee_name} off this task`}>
									×
								</button>
							</form>
						)}
					</li>
				);
			})}
		</ul>
	);
}

/** The round control at the start of a task row: one click marks it done (or not done again). */
function Tick({ task, viewer, back }: { task: TaskRow; viewer: Viewer; back: string }) {
	const can = canCompleteTask(viewer, task);
	if (task.status === 'dropped') return <span class="tick dropped" title="Dropped"></span>;
	if (!can) return <span class={`tick${task.status === 'done' ? ' on' : ''}`} title={task.status === 'done' ? 'Done' : 'Only the assignee or an exec can mark it done'}></span>;
	const done = task.status === 'done';
	return (
		<form method="post" action={`/tasks/${task.id}/status`} class="inline">
			<input type="hidden" name="back" value={back} />
			<input type="hidden" name="status" value={done ? 'open' : 'done'} />
			<button class={`tick${done ? ' on' : ''}`} title={done ? 'Mark not done' : 'Mark done'} aria-label={`Mark “${task.title}” ${done ? 'not done' : 'done'}`}></button>
		</form>
	);
}

/** "In progress" on an open task: a small toggle for whoever does it, a tag for everyone else. */
function Stage({ task, viewer, back }: { task: TaskRow; viewer: Viewer; back: string }) {
	if (task.status !== 'open') return null;
	const started = !!task.board_in_progress;
	if (!canCompleteTask(viewer, task)) return started ? <span class="stage on">In progress</span> : null;
	return (
		<form method="post" action={`/tasks/${task.id}/board-move`} class="inline stage-form">
			<input type="hidden" name="back" value={back} />
			<input type="hidden" name="status" value={started ? 'open' : 'in_progress'} />
			<button class={`stage${started ? ' on' : ''}`} title={started ? 'Back to to do' : 'Mark in progress'}>{started ? 'In progress' : 'Start'}</button>
		</form>
	);
}

function Ring({ done, total }: { done: number; total: number }) {
	const label = `${done} of ${total} done`;
	return <span class="ring" style={`--p:${total ? Math.round((100 * done) / total) : 0}%`} role="img" aria-label={label} title={label}></span>;
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

type Named = { name: string; email?: string };

/** Two people with the same name are impossible to tell apart, so anyone who shares a name in a list gets their NetID too. */
export function netIds(people: Named[]) {
	const count = new Map<string, number>();
	for (const p of people) count.set(p.name.trim().toLowerCase(), (count.get(p.name.trim().toLowerCase()) ?? 0) + 1);
	return (p: Named) => (p.email && (count.get(p.name.trim().toLowerCase()) ?? 0) > 1 ? p.email.split('@')[0] : '');
}

/** A person's name, with their NetID after it when someone else in the list has the same name. */
export function PersonName({ p, netId }: { p: Named; netId: (p: Named) => string }) {
	const id = netId(p);
	return (
		<>
			{p.name}
			{id && <small class="netid"> {id}</small>}
		</>
	);
}

export function MemberSelect({ name, members, selected, required, blank, id, label }: { name: string; members: (Pick<Member, 'id' | 'name'> & { email?: string })[]; selected?: number | null; required?: boolean; blank?: string; id?: string; label?: string }) {
	const netId = netIds(members);
	return (
		<select name={name} id={id} required={required} aria-label={label} data-person>
			{blank !== undefined && <option value="">{blank}</option>}
			{members.map((m) => (
				<option value={String(m.id)} selected={m.id === selected}>
					{m.name}
					{netId(m) && ` (${netId(m)})`}
				</option>
			))}
		</select>
	);
}

/**
 * One panel for picking people. Ticking a team chip ticks everyone on it and unticking it unticks
 * them; anyone can also be ticked on their own. Chips post as `team` (Whole club as `club`), people
 * as `personName`. Without JavaScript the chips and people are simply independent checkboxes.
 */
export function PeoplePicker({ label, hint, teams, club, pickedTeams, people, picked, teamsOf, personName }: { label: string; hint?: Child; teams: Pick<Team, 'id' | 'name'>[]; club?: boolean; pickedTeams: Set<number>; people: (Pick<Member, 'id' | 'name'> & { email?: string })[]; picked: Set<number>; teamsOf: Map<number, number[]>; personName: string }) {
	const netId = netIds(people);
	return (
		<fieldset class="field wide">
			<legend class="label">{label}</legend>
			<div class="picker">
				{(teams.length > 0 || club !== undefined) && (
					<div class="picker-teams chips">
						{club !== undefined && (
							<label>
								<input type="checkbox" name="team" value="club" checked={club} />
								<span>Whole club</span>
							</label>
						)}
						{teams.map((t) => (
							<label>
								<input type="checkbox" name="team" value={String(t.id)} checked={pickedTeams.has(t.id)} />
								<span>{t.name}</span>
							</label>
						))}
					</div>
				)}
				<div class="picker-list" data-pick-people>
					{[...people]
						.sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)))
						.map((p) => (
							<label data-teams={(teamsOf.get(p.id) ?? []).join(' ')}>
								<input type="checkbox" name={personName} value={String(p.id)} checked={picked.has(p.id)} />
								<PersonName p={p} netId={netId} />
							</label>
						))}
				</div>
				<div class="picker-search js-only">
					<span class="picker-count">
						<span data-picker-count></span> ·{' '}
						<button type="button" class="link-btn" data-picker-clear>
							Clear
						</button>
					</span>
				</div>
			</div>
			{hint && <span class="hint">{hint}</span>}
		</fieldset>
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
