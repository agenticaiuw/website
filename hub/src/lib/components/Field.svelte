<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, hint = undefined, wide = false, children }: { label: string; hint?: string | Snippet; wide?: boolean; children: Snippet } = $props();
</script>

<label class="field{wide ? ' wide' : ''}">
	<span class="label">{label}</span>
	{@render children()}
	{#if hint}<span class="hint">{#if typeof hint === 'function'}{@render hint()}{:else}{hint}{/if}</span>{/if}
</label>
