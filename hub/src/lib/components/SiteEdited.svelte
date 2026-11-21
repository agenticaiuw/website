<script lang="ts">
	import type { Edit } from '$lib/site';
	import SiteWhen from './SiteWhen.svelte';

	let { row, zone }: { row: Edit | undefined; zone: string } = $props();
</script>

{#if !row}<span class="muted">Original site text</span>{:else}<span class="muted">{row.name ?? 'Someone'} · <SiteWhen iso={row.edited_at} {zone} /></span>{/if}
