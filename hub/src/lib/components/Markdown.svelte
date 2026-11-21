<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';
	import Empty from './Empty.svelte';

	let { text, empty = '' }: { text: string; empty?: string } = $props();
</script>

{#if text.trim()}
	<div class="prose">{@html renderMarkdown(text)}</div>
{:else if empty}
	<Empty>{empty}</Empty>
{/if}
