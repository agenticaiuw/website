<script lang="ts">
	import { formatDate } from '$lib/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if form?.state === 'done'}
	<h1>Nice work</h1>
	<p class="sub">“{form.taskTitle}” is marked done.</p>
	<a class="btn" href="/">Open the hub</a>
{:else if form?.state === 'bad' || data.state === 'bad'}
	<h1>This link no longer works</h1>
	<p class="sub">It may have expired, or the task was reassigned. Sign in to update it instead.</p>
	<a class="btn primary" href="/">Open the hub</a>
{:else if data.state === 'closed'}
	<h1>Already {data.task.status === 'done' ? 'done' : 'closed'}</h1>
	<p class="sub">“{data.task.title}” needs nothing more from you.</p>
	<a class="btn" href="/tasks/{data.task.id}">View task</a>
{:else if data.state === 'open'}
	<p class="eyebrow">Due {formatDate(data.task.due_date)}</p>
	<h1>{data.task.title}</h1>
	<p class="sub">Mark this done? Reminders for it will stop.</p>
	<form method="post" action="/done" class="stack">
		<input type="hidden" name="t" value={data.token} />
		<label class="field">
			<span class="label">Note (optional)</span>
			<textarea name="note" rows={3} placeholder="Link to the PR, doc or result"></textarea>
		</label>
		<button class="btn primary">Mark done</button>
	</form>
{/if}
