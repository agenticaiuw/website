<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import SiteEdited from '$lib/components/SiteEdited.svelte';
	import { PAGE_HREF, SITE } from '$lib/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PageHead title="Website" sub="Everything on agenticaiuw.com. Changes go live within a minute, and every edit is kept with who made it.">
	{#snippet actions()}
		<a class="btn" href="/site/history">History</a>
		<a class="btn" href={SITE} target="_blank" rel="noopener noreferrer">Open the site ↗</a>
	{/snippet}
</PageHead>
<div class="site-pages">
	{#each data.pages as p}
		<section class="site-page">
			<h2 class="site-page-title">
				{p.page}
				{#if p.page !== 'Every page'}<a class="site-page-link" href={SITE + PAGE_HREF[p.page]} target="_blank" rel="noopener noreferrer">View ↗</a>{/if}
			</h2>
			<ul class="site-sections card">
				{#each p.sections as s}
					<li>
						<a href="/site/{s.key}" class="site-section-link">
							<span class="site-section-title">{s.title}</span>
							<span class="site-section-where">{s.where}</span>
							<span class="site-section-meta"><SiteEdited row={s.edited} zone={data.zone} /></span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
