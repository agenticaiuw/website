<script lang="ts">
	import type { Snippet } from 'svelte';

	type Text = string | Snippet;
	let { eyebrow = '', title, sub, actions }: { eyebrow?: string; title: Text; sub?: Text | false; actions?: Snippet } = $props();
</script>

<div class="page-head">
	<div>
		{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
		<h1>{#if typeof title === 'function'}{@render title()}{:else}{title}{/if}</h1>
		{#if sub}<p class="sub">{#if typeof sub === 'function'}{@render sub()}{:else}{sub}{/if}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>
