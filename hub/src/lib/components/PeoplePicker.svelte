<script lang="ts">
	import type { Snippet } from 'svelte';
	import { peopleList, picker } from '$lib/actions.js';
	import { netIds } from '$lib/ui';
	import PersonName from './PersonName.svelte';

	/**
	 * One panel for picking people. Ticking a team chip ticks everyone on it and unticking it unticks
	 * them; anyone can also be ticked on their own. Chips post as `team` (Whole club as `club`), people
	 * as `personName`. Without JavaScript the chips and people are simply independent checkboxes.
	 */
	let {
		label,
		hint = undefined,
		teams,
		club = undefined,
		pickedTeams,
		people,
		picked,
		teamsOf,
		personName
	}: {
		label: string;
		hint?: string | Snippet;
		teams: { id: number; name: string }[];
		club?: boolean;
		pickedTeams: Set<number>;
		people: { id: number; name: string; email?: string }[];
		picked: Set<number>;
		teamsOf: Map<number, number[]>;
		personName: string;
	} = $props();
	const netId = $derived(netIds(people));
	const sorted = $derived([...people].sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id))));
</script>

<fieldset class="field wide">
	<legend class="label">{label}</legend>
	<div class="picker" use:picker>
		{#if teams.length > 0 || club !== undefined}
			<div class="picker-teams chips">
				{#if club !== undefined}
					<label>
						<input type="checkbox" name="team" value="club" checked={club} />
						<span>Whole club</span>
					</label>
				{/if}
				{#each teams as t}
					<label>
						<input type="checkbox" name="team" value={String(t.id)} checked={pickedTeams.has(t.id)} />
						<span>{t.name}</span>
					</label>
				{/each}
			</div>
		{/if}
		<div class="picker-list" data-pick-people use:peopleList>
			{#each sorted as p}
				<label data-teams={(teamsOf.get(p.id) ?? []).join(' ')}>
					<input type="checkbox" name={personName} value={String(p.id)} checked={picked.has(p.id)} />
					<PersonName {p} {netId} />
				</label>
			{/each}
		</div>
		<div class="picker-search js-only">
			<span class="picker-count">
				<span data-picker-count></span> ·
				<button type="button" class="link-btn" data-picker-clear>Clear</button>
			</span>
		</div>
	</div>
	{#if hint}<span class="hint">{#if typeof hint === 'function'}{@render hint()}{:else}{hint}{/if}</span>{/if}
</fieldset>
