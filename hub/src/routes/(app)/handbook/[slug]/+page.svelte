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
	const p = $derived(data.page);
	const shown = $derived(data.shown);
	const here = $derived(`/handbook/${p.slug}`);
	const canEdit = $derived(data.editable && !data.old);
	const editing = $derived(canEdit && page.url.searchParams.has('edit'));
	const exec = $derived(isExec(data.viewer));
	// What's typed so far, for the preview beside the text.
	let draft = $state<string | null>(null);
</script>

<PageHead eyebrow={p.area} title={p.title}>
	{#snippet sub()}
		{#if p.audience === 'execs'}Execs only. {/if}{#if data.team}This is the <a href="/teams/{data.team.id}">{data.team.name}</a> team's page. {/if}{#if shown}Last changed by {shown.name ??
				'someone'}, {formatTimestamp(shown.edited_at, data.zone)}.{/if}
	{/snippet}
	{#snippet actions()}
		{#if canEdit && !editing}<a class="btn primary" href="{here}?edit">Edit</a>{/if}
	{/snippet}
</PageHead>
{#if data.old}
	<p class="card handbook-old">This is an older version. <a href={here}>See the current page</a>.</p>
{/if}
{#if editing}
	<form method="post" action="{here}?/save" class="handbook-editor">
		<input type="hidden" name="base" value={String(data.latestId ?? 0)} />
		<div class="card stack">
			<Field label="Text" hint="# Heading, - bullet, **bold**, [link](https://…)">
				<textarea name="body" maxlength={100000} value={data.latestBody} oninput={(e) => (draft = e.currentTarget.value)}></textarea>
			</Field>
			<Field label="What changed" hint="Optional. Shown in the history."><input name="note" maxlength={200} /></Field>
			<div class="row">
				<button class="btn primary">Save</button>
				<a class="btn ghost" href={here}>Cancel</a>
			</div>
		</div>
		<article class="card handbook" aria-label="Preview">
			<Markdown text={draft ?? data.latestBody} empty="Nothing here yet." />
		</article>
	</form>
{:else}
	<article class="card handbook">
		{#if shown?.body.trim()}<Markdown text={shown.body} />{:else}<Empty>Nothing here yet.</Empty>{/if}
	</article>
{/if}
{#if data.history.length > 1 && !editing}
	<details class="card disclose kb-more">
		<summary>History</summary>
		<ol class="handbook-history">
			{#each data.history as h}
				<li>
					<a href={h.id === data.latestId ? here : `${here}?v=${h.id}`} aria-current={h.id === shown?.id ? 'page' : undefined}>{formatTimestamp(h.edited_at, data.zone)}</a>
					<span class="muted">{' · '}{h.name ?? 'Someone'}{h.note && ` · ${h.note}`}</span>
				</li>
			{/each}
		</ol>
	</details>
{/if}
{#if exec && !editing}
	<details class="card disclose kb-more">
		<summary>Page settings</summary>
		<form method="post" action="{here}?/settings" class="stack">
			<div class="kb-settings">
				<Field label="Title"><input name="title" maxlength={120} required value={p.title} /></Field>
				<Field label="Section"><input name="area" maxlength={60} value={p.area} /></Field>
				<Field label="Who can read it">
					<select name="audience">
						<option value="members" selected={p.audience === 'members'}>Every member</option>
						<option value="execs" selected={p.audience === 'execs'}>Execs only</option>
					</select>
				</Field>
			</div>
			<div class="row">
				<button class="btn">Save settings</button>
				<button class="btn danger" formaction="{here}?/remove">Remove page</button>
			</div>
		</form>
	</details>
{/if}

<style>
	.kb-more { margin-top: 16px; max-width: 46rem; }
	.kb-settings { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
	.row { display: flex; gap: 8px; flex-wrap: wrap; }
	@media (max-width: 640px) {
		.kb-settings { grid-template-columns: minmax(0, 1fr); }
	}
</style>
