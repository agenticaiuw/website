<script lang="ts">
	import { boardTaskHref, type BoardTask } from '$lib/board';
	import { isExec } from '$lib/perm';
	import type { Viewer } from '$lib/types';
	import Due from './Due.svelte';
	import PostButton from './PostButton.svelte';

	/** Team board cards as task rows (My work, a person's page): done circle, In progress toggle, due date. */
	let { tasks, viewer, today, back }: { tasks: BoardTask[]; viewer: Viewer; today: string; back: string } = $props();
</script>

{#snippet move(t: BoardTask, status: string, cls: string, label: string, title: string)}
	<form method="post" action="{boardTaskHref(t.id)}/move" class="inline">
		<input type="hidden" name="back" value={back} />
		<input type="hidden" name="version" value={t.version} />
		<input type="hidden" name="status" value={status} />
		<button class={cls} {title} aria-label="{title}: {t.title}">{label}</button>
	</form>
{/snippet}

{#if tasks.length}
	<ul class="tasks">
		{#each tasks as t}
			{@const href = boardTaskHref(t.id)}
			{@const movable = isExec(viewer) || !!t.is_mine}
			{@const claim = !t.is_assigned && viewer.teamIds.has(t.team_id) && (t.status === 'open' || t.status === 'in_progress')}
			{@const active = t.status === 'open' || t.status === 'in_progress'}
			<li class="task {active ? 'open' : t.status}">
				{#if movable && t.status !== 'dropped'}
					{@render move(t, t.status === 'done' ? 'open' : 'done', `tick${t.status === 'done' ? ' on' : ''}`, '', t.status === 'done' ? 'Mark not done' : 'Mark done')}
				{:else}
					<span class="tick{t.status === 'done' ? ' on' : t.status === 'dropped' ? ' dropped' : ''}"></span>
				{/if}
				<div class="task-main">
					<a {href} class="task-title">{t.title}</a>
					<div class="task-meta">
						<span>{t.team_name} board</span>
						<span>{t.responsible_people || 'Unassigned'}</span>
					</div>
				</div>
				{#if claim}<PostButton action="{href}/claim" label="Take it" cls="stage" {back} />{/if}
				{#if active && movable}
					{@render move(
						t,
						t.status === 'in_progress' ? 'open' : 'in_progress',
						`stage${t.status === 'in_progress' ? ' on' : ''}`,
						t.status === 'in_progress' ? 'In progress' : 'Start',
						t.status === 'in_progress' ? 'Back to to do' : 'Mark in progress'
					)}
				{/if}
				{#if active && !movable && t.status === 'in_progress'}<span class="stage on">In progress</span>{/if}
				<Due task={{ due_date: t.due_date, status: active ? 'open' : t.status === 'done' ? 'done' : 'dropped' }} {today} />
			</li>
		{/each}
	</ul>
{/if}
