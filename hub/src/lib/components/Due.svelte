<script lang="ts">
	import { dueLabel, formatDue, formatTime, isTime } from '$lib/dates';

	let { task, today }: { task: { due_date: string; status: string; due_time?: string }; today: string } = $props();
	const d = $derived(dueLabel(task.due_date, today));
	// Due today with a time: say when.
	const text = $derived(d.tone === 'today' && isTime(task.due_time) ? `${d.text}, ${formatTime(task.due_time)}` : d.text);
</script>

{#if task.status !== 'open'}
	<span class="pill {task.status}">{task.status === 'done' ? 'Done' : 'Dropped'}</span>
{:else}
	<span class="pill {d.tone}" title={formatDue(task.due_date, task.due_time, today)}>{text}</span>
{/if}
