<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import SiteChangeList from '$lib/components/SiteChangeList.svelte';
	import SiteWhen from '$lib/components/SiteWhen.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.version);
</script>

<PageHead eyebrow={data.section.title} title="Version {v.id}">
	{#snippet sub()}
		{v.name ?? 'Someone'} · <SiteWhen iso={v.edited_at} zone={data.zone} />{#if v.restored_from}{` · restored from version ${v.restored_from}`}{/if}{#if v.note}{` · “${v.note}”`}{/if}
	{/snippet}
	{#snippet actions()}
		<a class="btn" href="/site/{data.section.key}/history">History</a>
		{#if data.live}
			<span class="tag">Live</span>
		{:else}
			<form method="post" action="/site/{data.section.key}/restore/{v.id}" class="inline" data-confirm="Make this version live again? The current text stays in the history.">
				<button class="btn primary">Restore this version</button>
			</form>
		{/if}
	{/snippet}
</PageHead>
<section class="card">
	<h2 class="site-h2">What changed</h2>
	<SiteChangeList changes={data.changes} />
</section>
