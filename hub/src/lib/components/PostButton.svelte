<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A one-button form. `back` is where to land afterwards. */
	let {
		action,
		label,
		cls = 'btn',
		back = '',
		confirm = undefined,
		name = '',
		value = '',
		removeLabel = ''
	}: { action: string; label: string | Snippet; cls?: string; back?: string; confirm?: string; name?: string; value?: string | number; removeLabel?: string } = $props();
</script>

<form method="post" {action} class="inline" data-confirm={confirm}>
	{#if back}<input type="hidden" name="back" value={back} />{/if}
	{#if name}<input type="hidden" {name} {value} />{/if}
	<button class={removeLabel ? 'icon-btn remove-cross' : cls} aria-label={removeLabel || undefined} title={removeLabel || undefined}
		>{#if removeLabel}<span aria-hidden="true">×</span>{:else if typeof label === 'function'}{@render label()}{:else}{label}{/if}</button
	>
</form>
