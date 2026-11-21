<script lang="ts">
	let {
		name,
		teams,
		selected = null,
		required = false,
		blank = undefined,
		id = undefined,
		label = undefined
	}: { name: string; teams: { id: number; name: string }[]; selected?: number | null; required?: boolean; blank?: string; id?: string; label?: string } = $props();
</script>

<select {name} {id} {required} aria-label={label}>
	{#if blank !== undefined}<option value="">{blank}</option>{/if}
	{#each teams as t}
		<option value={String(t.id)} selected={t.id === selected}>{t.name}</option>
	{/each}
</select>
