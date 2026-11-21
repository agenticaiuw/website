<script lang="ts">
	import { BOARD_STATUSES, boardTaskHref, type BoardTask } from '$lib/board';
	import { formatDate } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { Viewer } from '$lib/types';
	import MoveCard from './MoveCard.svelte';
	import PostButton from './PostButton.svelte';

	let { task: t, viewer, today, back, board = false }: { task: BoardTask; viewer: Viewer; today: string; back: string; board?: boolean } = $props();
	const href = $derived(boardTaskHref(t.id));
	const claim = $derived(!t.is_assigned && viewer.teamIds.has(t.team_id) && t.status !== 'done' && t.status !== 'dropped');
	const movable = $derived(isExec(viewer) || !!t.is_mine);
	const meta = $derived(
		[!board && t.team_name, `Due ${formatDate(t.due_date, today)}`, t.responsible_people || (t.is_assigned ? 'No one active' : 'Unassigned'), t.subteams].filter(Boolean).join(' · ')
	);
</script>

<li id={board ? `board-task-${t.id}` : undefined} class="card board-card" draggable={board && movable ? 'true' : undefined} data-board-draggable={board && movable ? '' : undefined}>
	<div class="task-title-line">
		{#if t.status === 'done'}
			{#if movable}<MoveCard action="{href}/move" status="done" title={t.title} version={t.version} {back} />{:else}<span class="tick on done-mark" role="img" aria-label="Done" title="Done"></span>{/if}
		{/if}<a class="task-title" {href}>{t.title}</a>
	</div>
	<span class="card-meta">{meta}</span>
	{#if claim || (!board && t.status !== 'done')}
		<div class="card-actions">
			{#if !board && movable && t.status !== 'done'}<MoveCard action="{href}/move" status={t.status} title={t.title} version={t.version} {back} />{/if}
			{#if !board && !movable && t.status !== 'done'}<span class="hint">{BOARD_STATUSES.find(([status]) => status === t.status)?.[1]}</span>{/if}
			{#if claim}<PostButton action="{href}/claim" label="Take it" cls="btn small" {back} />{/if}
		</div>
	{/if}
	{#if board && movable && t.status !== 'done'}<MoveCard action="{href}/move" status={t.status} title={t.title} version={t.version} {back} />{/if}
</li>
