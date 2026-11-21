<script lang="ts">
	import { needsAssignee, peopleList } from '$lib/actions.js';
	import type { BoardTask } from '$lib/board';
	import type { RosterMember, Subteam } from '$lib/types';
	import { netIds } from '$lib/ui';
	import Field from './Field.svelte';
	import PersonName from './PersonName.svelte';

	let {
		action,
		due,
		members = undefined,
		subteams = undefined,
		assignedPeople,
		assignedSubteams,
		task = undefined,
		returnToBoard = false,
		returnPath = undefined
	}: {
		action: string;
		due: string;
		members?: Pick<RosterMember, 'id' | 'name' | 'email'>[];
		subteams?: Pick<Subteam, 'id' | 'name'>[];
		assignedPeople: Set<number>;
		assignedSubteams: Set<number>;
		task?: BoardTask;
		returnToBoard?: boolean;
		returnPath?: string;
	} = $props();
	const netId = $derived(netIds(members ?? []));
	const required = (form: HTMLFormElement) => (members ? needsAssignee(form) : undefined);
</script>

<form class="card stack" method="post" {action} data-board-assignment={members ? 'required' : undefined} use:required>
	{#if task}<input type="hidden" name="version" value={task.version} />{/if}
	{#if !task}<input type="hidden" name="status" value="open" />{/if}
	{#if returnToBoard}<input type="hidden" name="return_to_board" value="1" />{/if}
	{#if returnPath}<input type="hidden" name="return_path" value={returnPath} />{/if}
	<Field label="Task"><input name="title" maxlength={200} required value={task?.title ?? ''} /></Field>
	<Field label="Details"><textarea name="details" rows={4} maxlength={10000} value={task?.details ?? ''}></textarea></Field>
	<Field label="Due date"><input type="date" name="due" required value={task?.due_date ?? due} /></Field>
	{#if members}
		<fieldset>
			<legend>Assign to people</legend>
			<div class="selection-grid" data-pick-people use:peopleList>
				{#each members as m (m.id)}
					<label class="check">
						<input type="checkbox" name="person" value={m.id} checked={assignedPeople.has(m.id)} />
						<PersonName p={m} {netId} />
					</label>
				{/each}
			</div>
		</fieldset>
		{#if subteams?.length}
			<fieldset>
				<legend>Assign to subteams</legend>
				<div class="selection-grid">
					{#each subteams as s (s.id)}
						<label class="check">
							<input type="checkbox" name="subteam" value={s.id} checked={assignedSubteams.has(s.id)} />
							{s.name}
						</label>
					{/each}
				</div>
			</fieldset>
		{/if}
		<p class="hint">Assign at least one person or subteam. You can choose both.</p>
		<p class="hint" data-assignment-error hidden role="alert">Choose at least one person or subteam.</p>
	{/if}
	<div><button class="btn primary">{task ? 'Save task' : 'Create task'}</button></div>
</form>
