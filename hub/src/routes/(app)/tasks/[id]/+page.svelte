<script lang="ts">
	import { BOARD_STATUSES, individualStage } from '$lib/board';
	import Markdown from '$lib/components/Markdown.svelte';
	import MoveCard from '$lib/components/MoveCard.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import { formatDue, formatTimestamp } from '$lib/dates';
	import { canCompleteTask, canManageTask, canSeeTask } from '$lib/perm';
	import { ACTIVITY_VERB, repeatText } from '$lib/tasks';
	import { andList } from '$lib/text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
	const task = $derived(data.task);
	const today = $derived(data.today);
	const back = $derived(`/tasks/${task.id}`);
	const shared = $derived(data.copies.length > 1);
	const overview = $derived(data.overview);
	const total = $derived(data.copies.filter((t) => t.status !== 'dropped').length);
	const done = $derived(data.copies.filter((t) => t.status === 'done').length);
	const team = $derived(task.team_name ?? 'Task');
	// Who a reminder goes to: everyone on it who hasn't finished, except you.
	const pending = $derived((shared ? data.copies : [task]).filter((t) => t.status === 'open' && t.assignee_id !== v.id));
</script>

{#snippet progress()}
	<h2 class="section-title" id="everyone">Everyone <span class="count">{done} of {total} done</span></h2>
	<TaskList tasks={data.copies} {today} viewer={v} show={[]} by="assignee" back={overview ? `${back}?all=1` : `${back}#everyone`} removable={data.copies.length > 1} />
{/snippet}

{#snippet remind()}
	<h2 class="section-title" id="remind">Send a reminder</h2>
	<form method="post" action="/tasks/{task.id}/remind" class="stack">
		{#if overview}<input type="hidden" name="all" value="1" />{/if}
		<label class="field">
			<span class="label">Message to {andList(pending.map((t) => t.assignee_name))}</span>
			<textarea name="message" rows={3} maxlength={2000} required placeholder="What you need from them, and by when…"></textarea>
		</label>
		<div>
			<button class="btn">Email reminder</button>
		</div>
	</form>
{/snippet}

<PageHead eyebrow={shared && !overview && task.assignee_id !== v.id ? `${team} · ${task.assignee_name}’s copy` : team} title={task.title}>
	{#snippet actions()}
		{#if !overview && task.status !== 'done' && canCompleteTask(v, task)}<MoveCard action="/tasks/{task.id}/board-move" status={individualStage(task)} title={task.title} {back} />{/if}
		{#if canManageTask(v, task)}<a class="btn" href="/tasks/{task.id}/edit">Edit</a>{/if}
	{/snippet}
</PageHead>
<div class="grid-2 wide-left">
	<section>
		<dl class="facts card">
			<div>
				<dt>{overview ? 'Progress' : 'Status'}</dt>
				<dd>
					{#if overview}{done} of {total} done{:else}<span class="task-title-line"
							>{#if task.status === 'done'}{#if canCompleteTask(v, task)}<MoveCard action="/tasks/{task.id}/board-move" status="done" title={task.title} {back} />{:else}<span
										class="tick on done-mark"
										role="img"
										aria-label="Done"
										title="Done"
									></span>{/if}{:else}{BOARD_STATUSES.find(([status]) => status === individualStage(task))?.[1]}{/if}</span
						>{/if}
				</dd>
			</div>
			<div>
				<dt>Due</dt>
				<dd>{formatDue(task.due_date, task.due_time, today)}</dd>
			</div>
			{#if task.repeat_days > 0}
				<div>
					<dt>Repeats</dt>
					<dd>{repeatText(task, today)}{task.repeated ? ' · the next one has been made' : ' · the next one is made on the due date'}</dd>
				</div>
			{/if}
			{#if task.urgent}
				<div>
					<dt>Urgent</dt>
					<dd>Reminded every 2 hours once due{task.urgent_until ? `, until ${formatTimestamp(task.urgent_until, data.timeZone)}` : ''}</dd>
				</div>
			{/if}
			<div>
				<dt>Assigned to</dt>
				<dd>{#if overview}{data.copies.length} people{:else}<a href="/people/{task.assignee_id}">{task.assignee_id === v.id ? 'You' : task.assignee_name}</a>{/if}</dd>
			</div>
			<div>
				<dt>Assigned by</dt>
				<dd>{task.assigner_name ?? '—'}</dd>
			</div>
			{#if data.meeting}
				<div>
					<dt>From meeting</dt>
					<dd><a href="/meetings/{data.meeting.id}">{data.meeting.title}</a></dd>
				</div>
			{/if}
			{#if !overview}
				<div>
					<dt>Reminders sent</dt>
					<dd>{task.reminders_sent}</dd>
				</div>
			{/if}
		</dl>
		<h2 class="section-title">Details</h2>
		<Markdown text={task.details} empty="No details." />
		{#if !overview && shared}{@render progress()}{/if}
		{#if pending.length && canManageTask(v, task)}{@render remind()}{/if}
	</section>
	{#if overview}
		<section>{@render progress()}</section>
	{:else}
		<section>
			<h2 class="section-title">Activity</h2>
			<ol class="timeline">
				{#each data.activity as a (a.id)}
					<li class="ev {a.kind}">
						<div class="ev-head">
							<b>{a.member_name ?? 'Hub'}</b>
							{a.member_name ? (ACTIVITY_VERB[a.kind] ?? a.kind) : ''}
							<time>{formatTimestamp(a.created_at, data.timeZone)}</time>
						</div>
						{#if a.body}{#if a.kind === 'comment' || a.kind === 'reminded'}<Markdown text={a.body} />{:else}<p class="ev-body">{a.body}</p>{/if}{/if}
					</li>
				{/each}
			</ol>
			{#if canSeeTask(v, task)}
				<form method="post" action="/tasks/{task.id}/comment" class="stack">
					<label class="field">
						<span class="label">Add a comment</span>
						<textarea name="body" rows={3} required placeholder="Progress, blockers, a link to the result…"></textarea>
					</label>
					<div>
						<button class="btn">Comment</button>
					</div>
				</form>
			{/if}
		</section>
	{/if}
</div>
