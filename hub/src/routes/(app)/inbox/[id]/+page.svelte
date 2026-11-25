<script lang="ts">
	import Thread from './Thread.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- A fresh reading pane for each conversation, so nothing half-written or opened carries over. -->
{#key data.thread.id}
	<Thread {data} />
{/key}
