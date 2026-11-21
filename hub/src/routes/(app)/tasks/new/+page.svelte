<script lang="ts">
	import { addRow } from '$lib/actions.js';
	import Field from '$lib/components/Field.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import RepeatFields from '$lib/components/RepeatFields.svelte';
	import TeamSelect from '$lib/components/TeamSelect.svelte';
	import { canAssign, isExec } from '$lib/perm';
	import { URGENT_LABEL } from '$lib/tasks';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
</script>

<PageHead
	eyebrow="Tasks"
	title="New task"
	sub={canAssign(v)
		? 'Give it to one person or a whole team. Each person is emailed and reminded until they’re done, and you see everyone’s progress on one task.'
		: 'Track something you committed to. You’ll get reminders before it’s due.'}
>
	{#snippet actions()}<a class="btn" href="/teams">Create a shared team task</a>{/snippet}
</PageHead>
<form method="post" action="/tasks" class="card form-grid">
	<div class="field wide">
		<span class="label">What needs to happen</span>
		<div class="action-rows" data-rows>
			<div class="task-row" data-row>
				<input name="title" required maxlength={200} placeholder="e.g. Order the nRF52 dev boards" aria-label="Task" />
				<input type="date" name="due_date" required value={data.due} min={data.minDue} aria-label="Due date" />
				<input type="time" name="due_time" aria-label="Due time (optional)" />
			</div>
		</div>
		<div>
			<button type="button" class="btn ghost small js-only" data-add-row use:addRow>+ Another task</button>
		</div>
		<span class="hint">Each line is its own task with its own due date and, if you want, a time. Everyone you pick gets every task, in one email.</span>
	</div>
	<Field label="Details" hint="Optional. Links, context, what “done” looks like. With several tasks, each one gets these details." wide>
		<textarea name="details" rows={4}></textarea>
	</Field>
	{#if canAssign(v)}
		<PeoplePicker
			label="Assign to"
			hint={`Tick a team to add everyone on it, then untick anyone who isn’t needed. Each person’s task goes under their team.${isExec(v) ? '' : ' You can assign people on the teams you lead.'}`}
			teams={data.pickTeams}
			pickedTeams={new Set(data.preTeam ? [data.preTeam] : [])}
			people={data.people}
			picked={data.picked}
			teamsOf={data.teamsOf}
			personName="assignee"
		/>
	{:else}
		<input type="hidden" name="assignee" value={String(v.id)} />
		<Field label="Team">
			<TeamSelect name="team" teams={data.ownTeams} selected={data.preTeam} blank="No team" />
		</Field>
	{/if}
	<RepeatFields days={0} until={null} />
	<label class="check wide">
		<input type="checkbox" name="urgent" value="1" />
		{URGENT_LABEL}
	</label>
	<div class="form-actions wide">
		<button class="btn primary">Create task</button>
		<a class="btn ghost" href="/tasks">Cancel</a>
	</div>
</form>
