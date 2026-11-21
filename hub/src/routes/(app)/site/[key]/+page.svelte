<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { siteForm } from '$lib/actions.js';
	import Notice from '$lib/components/Notice.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import SiteEdited from '$lib/components/SiteEdited.svelte';
	import SiteFields from '$lib/components/SiteFields.svelte';
	import SiteWhen from '$lib/components/SiteWhen.svelte';
	import { PAGE_HREF, SITE } from '$lib/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const section = $derived(data.section);
	// After a failed save the editor shows what was sent, not what's stored.
	const values = $derived(form?.data ?? data.data);
	const errors = $derived(form?.errors ?? []);
	let editor = $state<HTMLFormElement>();

	// Unsaved edits: send in-app links through a full page load so the browser asks before leaving.
	beforeNavigate(({ cancel, to, willUnload }) => {
		if (!willUnload && to?.url && editor?.hasAttribute('data-dirty')) {
			cancel();
			location.href = to.url.href;
		}
	});
</script>

<PageHead eyebrow="Website · {section.page}" title={section.title} sub={section.where}>
	{#snippet actions()}
		<a class="btn" href="/site/{section.key}/history">History</a>
		{#if section.page !== 'Every page'}<a class="btn" href={SITE + PAGE_HREF[section.page]} target="_blank" rel="noopener noreferrer">View page ↗</a>{/if}
	{/snippet}
</PageHead>
{#if errors.length}
	<div class="system-notices site-notices">
		<Notice error>
			<p>Nothing was saved yet. Fix these first:</p>
			<ul>
				{#each errors.slice(0, 12) as e}<li>{e}</li>{/each}
			</ul>
		</Notice>
	</div>
{/if}
{#if form?.staleShown}
	<div class="system-notices site-notices">
		<Notice error>
			{#if form.stale}
				{form.stale.name ?? 'Someone'} saved this section at <SiteWhen iso={form.stale.edited_at} zone={data.zone} /> while you were editing. Your text is still below. Check <a href="/site/v/{form.stale.id}">their change</a>, then press
				Save again to replace it with yours.
			{:else}
				This section changed while you were editing. Your text is still below; press Save again to keep it.
			{/if}
		</Notice>
	</div>
{/if}
<div class="site-editor-layout">
	<form method="post" action="/site/{section.key}" class="site-form" data-site-form use:siteForm bind:this={editor}>
		<input type="hidden" name="data" value="" />
		<input type="hidden" name="base" value={String(data.row?.id ?? '')} />
		{#if form?.staleShown}<input type="hidden" name="force" value="1" />{/if}
		<div class="site-root card" data-site-root>
			<SiteFields fields={section.fields} data={values} teams={data.teams} />
		</div>
		<div class="site-savebar">
			<label class="site-note">
				<span class="sr-only">Note about this change</span>
				<textarea name="note" rows={1} maxlength={200} placeholder="What changed? (optional, shown in History)" data-note value={form?.note ?? ''}></textarea>
			</label>
			<button class="btn primary">Save</button>
		</div>
	</form>
	<aside class="site-aside">
		<section class="card">
			<h2 class="site-h2">Last edit</h2>
			<p><SiteEdited row={data.row} zone={data.zone} /></p>
			{#if data.recent.length > 0}
				<ol class="site-recent">
					{#each data.recent as r}
						{#if r}
							<li>
								<a href="/site/v/{r.id}">Version {r.id}</a>
								<span class="muted">{' · '}{r.name ?? 'Someone'} · <SiteWhen iso={r.edited_at} zone={data.zone} /></span>
							</li>
						{/if}
					{/each}
				</ol>
			{/if}
			<p><a href="/site/{section.key}/history">Full history →</a></p>
		</section>
		<details class="card disclose site-tokens">
			<summary>Placeholders</summary>
			<p class="hint">Type these in any text and the site fills them in, so a number or name only has to change in one place.</p>
			<dl>
				{#each data.tokens as [t, d]}
					<dt><code>{t}</code></dt>
					<dd>{d}</dd>
				{/each}
			</dl>
		</details>
	</aside>
</div>
