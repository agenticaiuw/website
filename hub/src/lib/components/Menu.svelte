<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A "⋯" button that opens a small panel of actions. */
	let { label, form = false, children }: { label: string; form?: boolean; children: Snippet } = $props();
</script>

<details class="menu">
	<summary class="icon-btn" aria-label={label} title={label}>⋯</summary>
	<div class="menu-panel{form ? ' form' : ''}">{@render children()}</div>
</details>
