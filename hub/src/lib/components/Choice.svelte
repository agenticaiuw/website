<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Radio buttons drawn as one segmented control. */
	let { name, options, selected, label, hint }: { name: string; options: [string, string][]; selected: string; label: string; hint?: string | Snippet } = $props();
</script>

<fieldset class="field">
	<legend class="label">{label}</legend>
	<div class="seg full">
		{#each options as [value, text]}
			<label>
				<input type="radio" {name} {value} checked={value === selected} />
				<span>{text}</span>
			</label>
		{/each}
	</div>
	{#if hint}<span class="hint">{#if typeof hint === 'function'}{@render hint()}{:else}{hint}{/if}</span>{/if}
</fieldset>
