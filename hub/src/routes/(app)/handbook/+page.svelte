<script lang="ts">
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const shown = $derived(data.shown);
</script>

<PageHead title="Handbook">
	{#snippet sub()}
		{#if shown}The club's goals and rules as they stand now. If a Drive doc says something else, this page is right. Last changed by {shown.name ?? 'someone'}, {formatTimestamp(
				shown.edited_at,
				data.zone
			)}.{:else}The club's goals and rules as they stand now.{/if}
	{/snippet}
</PageHead>
{#if data.old}
	<p class="card handbook-old">This is an older version. <a href="/handbook">See the current handbook</a>.</p>
{/if}
<article class="card handbook">
	{#if shown}<Markdown text={shown.body} />{:else}<Empty>Nothing here yet.</Empty>{/if}
</article>
{#if isExec(data.viewer) && !data.old}
	<details class="card disclose">
		<summary>Edit handbook</summary>
		<form method="post" action="/handbook" class="stack">
			<input type="hidden" name="base" value={String(data.latestId ?? 0)} />
			<Field label="Text" hint="# Heading, - bullet, **bold**, [link](https://…)">
				<textarea name="body" rows={28} maxlength={50000} required value={data.latestBody}></textarea>
			</Field>
			<Field label="What changed" hint="Optional. Shown in the history."><input name="note" maxlength={200} /></Field>
			<div><button class="btn primary">Save</button></div>
		</form>
	</details>
{/if}
{#if data.history.length > 1}
	<details class="card disclose">
		<summary>History</summary>
		<ol class="handbook-history">
			{#each data.history as h}
				<li>
					<a href={h.id === data.latestId ? '/handbook' : `/handbook?v=${h.id}`} aria-current={h.id === shown?.id ? 'page' : undefined}>{formatTimestamp(h.edited_at, data.zone)}</a>
					<span class="muted">{' · '}{h.name ?? 'Someone'}{h.note && ` · ${h.note}`}</span>
				</li>
			{/each}
		</ol>
	</details>
{/if}
