<script lang="ts">
	import { BOARD_STATUSES, boardTaskHref } from '$lib/board';
	import BoardTaskForm from '$lib/components/BoardTaskForm.svelte';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import MoveCard from '$lib/components/MoveCard.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PostButton from '$lib/components/PostButton.svelte';
	import { formatDate, formatTimestamp } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
	const task = $derived(data.task);
	const href = $derived(boardTaskHref(task.id));
	const canMove = $derived(isExec(v) || !!task.is_mine);
</script>

<PageHead title={task.title}>
	{#snippet sub()}<a href="/teams/{task.team_id}">{task.team_name}</a>{/snippet}
</PageHead>
<div class="grid-2 wide-left">
	<section class="stack">
		<dl class="facts card">
			<div>
				<dt>Status</dt>
				<dd>
					<span class="task-title-line"
						>{#if task.status === 'done'}{#if canMove}<MoveCard action="{href}/move" status="done" title={task.title} back={href} version={task.version} />{:else}<span
									class="tick on done-mark"
									role="img"
									aria-label="Done"
									title="Done"
								></span>{/if}{:else}{BOARD_STATUSES.find(([status]) => status === task.status)?.[1]}{/if}</span
					>
				</dd>
			</div>
			<div><dt>Due</dt><dd>{formatDate(task.due_date, data.today)}</dd></div>
			<div><dt>Assigned to</dt><dd>{[task.people, task.subteams].filter(Boolean).join(' · ') || 'Unassigned'}</dd></div>
		</dl>
		{#if task.status !== 'done' && canMove}<MoveCard action="{href}/move" status={task.status} title={task.title} back={href} version={task.version} />{/if}
		{#if !task.is_assigned && v.teamIds.has(task.team_id) && ['open', 'in_progress'].includes(task.status)}
			<PostButton action="{href}/claim" label="Assign to me" back={href} />
		{/if}
		<Markdown text={task.details} empty="No details." />
		{#if data.manager || task.created_by === v.id}
			<details>
				<summary class="link-btn">Edit task</summary>
				<BoardTaskForm
					action="{href}/edit"
					due={task.due_date}
					{task}
					members={data.members}
					subteams={data.subteams}
					assignedPeople={data.assignedPeople}
					assignedSubteams={data.assignedSubteams}
				/>
			</details>
		{/if}
	</section>
	<section class="stack">
		<h2 class="section-title">Activity</h2>
		{#if data.activity.length}
			<ol class="timeline">
				{#each data.activity as a, i (i)}
					<li class="ev">
						<div class="ev-head"><b>{a.name}</b> {a.kind}<time>{formatTimestamp(a.created_at, data.timeZone)}</time></div>
						{#if a.kind === 'comment'}<Markdown text={a.body} />{:else if a.body}<p>{a.body}</p>{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<Empty>No activity yet.</Empty>
		{/if}
		<form class="stack" method="post" action="{href}/comment">
			<Field label="Add a comment"><textarea name="body" rows={3} maxlength={5000} required></textarea></Field>
			<div><button class="btn">Comment</button></div>
		</form>
	</section>
</div>
