<script lang="ts">
	import { personSelect } from '$lib/actions.js';
	import { netIds } from '$lib/ui';

	type Person = { id: number; name: string; email?: string };
	let {
		name,
		members,
		selected = null,
		required = false,
		blank = undefined,
		id = undefined,
		label = undefined
	}: { name: string; members: Person[]; selected?: number | null; required?: boolean; blank?: string; id?: string; label?: string } = $props();
	const netId = $derived(netIds(members));
</script>

<select {name} {id} {required} aria-label={label} data-person use:personSelect>
	{#if blank !== undefined}<option value="">{blank}</option>{/if}
	{#each members as m}
		<option value={String(m.id)} selected={m.id === selected}>{m.name}{netId(m) ? ` (${netId(m)})` : ''}</option>
	{/each}
</select>
