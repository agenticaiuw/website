<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import RepeatFields from '$lib/components/RepeatFields.svelte';
	import TeamSelect from '$lib/components/TeamSelect.svelte';
	import { repeatText, URGENT_LABEL } from '$lib/tasks';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const task = $derived(data.task);
</script>

<PageHead eyebrow="Edit task" title={task.title} />
<form method="post" action="/tasks/{task.id}" class="card form-grid">
	<Field label="Title" wide>
		<input name="title" required maxlength={200} value={task.title} />
	</Field>
	<Field label="Details" wide>
		<textarea name="details" rows={5} value={task.details}></textarea>
	</Field>
	<PeoplePicker
		label="Assigned to"
		hint="Everyone ticked is on this task. Tick someone to add them (they’re emailed); untick to take them off (their copy and its history are deleted)."
		teams={data.pickTeams}
		pickedTeams={new Set()}
		people={data.people}
		picked={data.picked}
		teamsOf={data.teamsOf}
		personName="assignee"
	/>
	<Field label="Due date" hint="Everyone already on the task is emailed the new date.">
		<input type="date" name="due_date" required value={task.due_date} />
	</Field>
	<Field label="Due time" hint="Optional. With a time, reminders go a day before and 4 hours before.">
		<input type="time" name="due_time" value={task.due_time} />
	</Field>
	<Field label="Team">
		<TeamSelect name="team" teams={data.teamChoices} selected={task.team_id} blank="No team" />
	</Field>
	{#if task.repeated}
		{#if task.repeat_days > 0}<p class="hint wide">{`This repeats ${repeatText(task, data.today).replace(/^E/, 'e')}. The next one is already made, so change the repeat there.`}</p>{/if}
	{:else}
		<RepeatFields days={task.repeat_days} until={task.repeat_until} />
	{/if}
	<label class="check wide">
		<input type="checkbox" name="urgent" value="1" checked={!!task.urgent} />
		{URGENT_LABEL}
	</label>
	<div class="form-actions wide">
		<button class="btn primary">Save</button>
		<a class="btn ghost" href="/tasks/{task.id}">Cancel</a>
		<span class="spacer"></span>
		{#if task.status === 'open'}
			<button class="btn danger" formaction="/tasks/{task.id}/status" name="status" value="dropped" data-confirm="Drop this task for everyone? Reminders stop and it’s marked as not happening."
				>Drop task</button
			>
		{/if}
		<input type="hidden" name="all" value="1" />
	</div>
</form>
