<script lang="ts">
	import type { HistoryEntry } from '$lib/site';
	import Empty from './Empty.svelte';
	import PageHead from './PageHead.svelte';
	import SiteChangeList from './SiteChangeList.svelte';
	import SiteWhen from './SiteWhen.svelte';

	/** Every edit to the website, or to one section, newest first. */
	let {
		section,
		entries,
		more,
		before,
		base,
		zone
	}: { section: { key: string; title: string } | null; entries: HistoryEntry[]; more: boolean; before: number | null; base: string; zone: string } = $props();
</script>

<PageHead eyebrow="Website" title={section ? `${section.title}: history` : 'History'} sub="Every edit to the website, newest first, with who made it and exactly what changed.">
	{#snippet actions()}<a class="btn" href={section ? `/site/${section.key}` : '/site'}>{section ? 'Back to editor' : 'All sections'}</a>{/snippet}
</PageHead>
{#if entries.length}
	<ol class="site-history">
		{#each entries as r (r.id)}
			<li class="card site-entry">
				<div class="site-entry-head">
					<div>
						<p class="site-entry-who">
							<strong>{r.name ?? 'Someone'}</strong>
							{#if r.restored_from}restored version {r.restored_from} of{:else}edited{/if}{' '}{#if !section}<a href="/site/{r.section}">{r.sectionTitle}</a>{:else}{r.sectionTitle}{/if}
						</p>
						<p class="muted site-entry-when">
							<SiteWhen iso={r.edited_at} {zone} /> · Version {r.id} · {r.total} {r.total === 1 ? 'change' : 'changes'}
							{#if r.live}<span class="tag">Live</span>{/if}
						</p>
						{#if r.note}<p class="site-entry-note">“{r.note}”</p>{/if}
					</div>
					<a class="btn small" href="/site/v/{r.id}">View</a>
				</div>
				<SiteChangeList changes={r.changes} />
				{#if r.total > 12}<p class="muted"><a href="/site/v/{r.id}">{r.total - 12} more changes</a></p>{/if}
			</li>
		{/each}
		{#if section && !more}
			<li class="card site-entry">
				<div class="site-entry-head">
					<div>
						<p class="site-entry-who"><strong>Original site text</strong></p>
						<p class="muted site-entry-when">What this section said before editing moved to the hub.</p>
					</div>
					<form method="post" action="/site/{section.key}/restore-original" class="inline" data-confirm="Put back the original text? The current text stays in the history.">
						<button class="btn small">Restore</button>
					</form>
				</div>
			</li>
		{/if}
	</ol>
{:else}
	<Empty>No edits yet. The site still shows its original text.</Empty>
{/if}
{#if more || before}
	<nav class="site-pager" aria-label="History pages">
		{#if before}<a class="btn" href={base}>Newest</a>{/if}
		{#if more}<a class="btn" href="{base}?before={entries[entries.length - 1].id}">Older</a>{/if}
	</nav>
{/if}
