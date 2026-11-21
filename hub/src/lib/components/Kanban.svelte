<script lang="ts">
	import { kanban, opensDialog } from '$lib/actions.js';
	import { BOARD_STATUSES, type BoardTask } from '$lib/board';
	import { formatDate } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { TaskRow, Viewer } from '$lib/types';
	import Empty from './Empty.svelte';
	import MoveCard from './MoveCard.svelte';
	import SharedCard from './SharedCard.svelte';

	let { tasks, legacy, viewer, today, back, canCreate = false }: { tasks: BoardTask[]; legacy: TaskRow[]; viewer: Viewer; today: string; back: string; canCreate?: boolean } = $props();
</script>

<div class="kanban" tabindex="0" role="region" aria-label="Task board" use:kanban>
	{#each BOARD_STATUSES as [status, label]}
		{@const shared = tasks.filter((t) => t.status === status)}
		{@const rows = legacy.filter((t) => (t.status === 'open' && t.board_in_progress ? 'in_progress' : t.status) === status)}
		<section class="kanban-column" data-board-stage={status}>
			<h3 class="section-title">
				{label} <span class="count">{shared.length + rows.length}</span>{#if canCreate}<button
						type="button"
						class="icon-btn board-add"
						aria-label="Add task to {label}"
						title="Add task to {label}"
						aria-haspopup="dialog"
						aria-controls="new-team-task"
						data-board-add={status}
						use:opensDialog={'new-team-task'}>+</button
					>{/if}
			</h3>
			{#if !shared.length && !rows.length}<Empty>No tasks.</Empty>{/if}
			<ul class="board-list">
				{#each shared as task}<SharedCard {task} {viewer} {today} {back} board />{/each}
				{#each rows as t}
					{@const mine = isExec(viewer) || t.assignee_id === viewer.id}
					<li class="card board-card" draggable={mine ? 'true' : undefined} data-board-draggable={mine ? '' : undefined}>
						<div class="task-title-line">
							{#if t.status === 'done'}
								{#if mine}<MoveCard action="/tasks/{t.id}/board-move" status="done" title={t.title} {back} />{:else}<span class="tick on done-mark" role="img" aria-label="Done" title="Done"></span>{/if}
							{/if}<a class="task-title" href="/tasks/{t.id}">{t.title}</a>
						</div>
						<span class="card-meta">Due {formatDate(t.due_date, today)} · {t.assignee_id === viewer.id ? 'You' : t.assignee_name}</span>
						{#if t.status !== 'done' && mine}<MoveCard action="/tasks/{t.id}/board-move" {status} title={t.title} {back} />{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
