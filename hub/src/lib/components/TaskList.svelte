<script lang="ts">
	import type { Snippet } from 'svelte';
	import { canCompleteTask, canManageTask } from '$lib/perm';
	import type { TaskRow, Viewer } from '$lib/types';
	import { collapseTasks, type GroupStats } from '$lib/ui';
	import Due from './Due.svelte';
	import Empty from './Empty.svelte';

	let {
		tasks,
		today,
		viewer,
		show = ['assignee', 'team'],
		back,
		empty = 'Nothing here.',
		groups = undefined,
		by = 'title',
		removable = false
	}: {
		tasks: TaskRow[];
		today: string;
		viewer: Viewer;
		show?: ('assignee' | 'team' | 'meeting')[];
		back: string;
		empty?: string | Snippet;
		/** When given, a shared task shows once, with everyone's progress. */
		groups?: GroupStats;
		/** 'assignee' names each row by person, for the copies of one shared task. */
		by?: 'title' | 'assignee';
		/** With by="assignee": a button to take each person off the shared task, for those who manage it. */
		removable?: boolean;
	} = $props();

	const rows = $derived(groups ? collapseTasks(tasks, viewer.id) : tasks.map((t) => ({ task: t, copies: [t] })));
</script>

{#if !tasks.length}
	<Empty>{#if typeof empty === 'function'}{@render empty()}{:else}{empty}{/if}</Empty>
{:else}
	<ul class="tasks">
		{#each rows as { task: t, copies }}
			{@const stats = copies.length > 1 ? (groups?.get(t.group_id!) ?? { total: copies.length, done: 0 }) : null}
			{@const open = copies.find((x) => x.status === 'open')}
			{@const meta = [
				stats ? `${stats.done} of ${stats.total} done` : show.includes('assignee') && by === 'title' && (t.assignee_id === viewer.id ? 'You' : t.assignee_name),
				show.includes('team') && t.team_name,
				show.includes('meeting') && t.meeting_title && `From ${t.meeting_title}`
			].filter(Boolean)}
			{@const done = t.status === 'done'}
			<li class="task {open ? 'open' : t.status}">
				{#if stats}
					{@const label = `${stats.done} of ${stats.total} done`}
					<span class="ring" style="--p:{stats.total ? Math.round((100 * stats.done) / stats.total) : 0}%" role="img" aria-label={label} title={label}></span>
				{:else if t.status === 'dropped'}
					<span class="tick dropped" title="Dropped"></span>
				{:else if !canCompleteTask(viewer, t)}
					<span class="tick{done ? ' on' : ''}" title={done ? 'Done' : 'Only the assignee or an exec can mark it done'}></span>
				{:else}
					<form method="post" action="/tasks/{t.id}/status" class="inline">
						<input type="hidden" name="back" value={back} />
						<input type="hidden" name="status" value={done ? 'open' : 'done'} />
						<button class="tick{done ? ' on' : ''}" title={done ? 'Mark not done' : 'Mark done'} aria-label="Mark “{t.title}” {done ? 'not done' : 'done'}"></button>
					</form>
				{/if}
				<div class="task-main">
					<a href="/tasks/{t.id}{stats && t.assignee_id !== viewer.id ? '?all=1' : ''}" class="task-title">
						{by === 'assignee' ? (t.assignee_id === viewer.id ? 'You' : t.assignee_name) : t.title}
					</a>
					{#if meta.length > 0}
						<div class="task-meta">
							{#each meta as m}<span>{m}</span>{/each}
						</div>
					{/if}
				</div>
				{#if !stats && t.status === 'open'}
					{@const started = !!t.board_in_progress}
					{#if canCompleteTask(viewer, t)}
						<form method="post" action="/tasks/{t.id}/board-move" class="inline stage-form">
							<input type="hidden" name="back" value={back} />
							<input type="hidden" name="status" value={started ? 'open' : 'in_progress'} />
							<button class="stage{started ? ' on' : ''}" title={started ? 'Back to to do' : 'Mark in progress'}>{started ? 'In progress' : 'Start'}</button>
						</form>
					{:else if started}
						<span class="stage on">In progress</span>
					{/if}
				{/if}
				{#if open}<Due task={open} {today} />{/if}
				{#if removable && by === 'assignee' && canManageTask(viewer, t)}
					<form
						method="post"
						action="/tasks/{t.id}/remove"
						class="inline"
						data-confirm="Take {t.assignee_name} off this task? Their copy and its history are deleted; everyone else keeps theirs."
					>
						<input type="hidden" name="back" value={back} />
						<button class="icon-btn remove" title="Take {t.assignee_name} off this task" aria-label="Take {t.assignee_name} off this task">×</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
