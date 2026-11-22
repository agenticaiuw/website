<script lang="ts">
	import { page } from '$app/state';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const shown = $derived(data.shown);
	const canEdit = $derived(isExec(data.viewer) && !data.old);
	const editing = $derived(canEdit && page.url.searchParams.has('edit'));
	// What's typed so far, for the preview beside the text.
	let draft = $state<string | null>(null);
</script>

<PageHead title="Handbook">
	{#snippet sub()}
		{#if shown}The club's goals and rules as they stand now. If a Drive doc says something else, this page is right. Last changed by {shown.name ?? 'someone'}, {formatTimestamp(
				shown.edited_at,
				data.zone
			)}.{:else}The club's goals and rules as they stand now.{/if}
	{/snippet}
	{#snippet actions()}
		{#if canEdit && !editing}<a class="btn primary" href="/handbook?edit">Edit</a>{/if}
	{/snippet}
</PageHead>
{#if data.old}
	<p class="card handbook-old">This is an older version. <a href="/handbook">See the current handbook</a>.</p>
{/if}
{#if editing}
	<form method="post" action="/handbook" class="handbook-editor">
		<input type="hidden" name="base" value={String(data.latestId ?? 0)} />
		<div class="card stack">
			<Field label="Text" hint="# Heading, - bullet, **bold**, [link](https://…)">
				<textarea name="body" maxlength={50000} required value={data.latestBody} oninput={(e) => (draft = e.currentTarget.value)}></textarea>
			</Field>
			<Field label="What changed" hint="Optional. Shown in the history."><input name="note" maxlength={200} /></Field>
			<div class="row">
				<button class="btn primary">Save</button>
				<a class="btn ghost" href="/handbook">Cancel</a>
			</div>
		</div>
		<article class="card handbook" aria-label="Preview">
			<Markdown text={draft ?? data.latestBody} empty="Nothing here yet." />
		</article>
	</form>
{:else}
	<article class="card handbook">
		{#if shown}<Markdown text={shown.body} />{:else}<Empty>Nothing here yet.</Empty>{/if}
	</article>
{/if}
{#if data.history.length > 1 && !editing}
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
