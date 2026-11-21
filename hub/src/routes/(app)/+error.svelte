<script lang="ts">
	import { page } from '$app/state';
	import PageHead from '$lib/components/PageHead.svelte';
</script>

{#if page.status === 404}
	<PageHead title="Not found">
		{#snippet sub()}It doesn't exist, or you don't have access to it. <a href="/">Back to my work</a>{/snippet}
	</PageHead>
{:else if page.status === 403}
	<PageHead title={page.error?.message ?? 'Not found'} />
{:else}
	<PageHead title="Something went wrong" sub={page.error?.message} />
{/if}
