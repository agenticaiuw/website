<script lang="ts">
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const exec = $derived(isExec(data.viewer));
	// A team's page is read on the team's own page, next to its people and meetings.
	const href = (p: { slug: string; team_id: number | null }) => (p.team_id ? `/teams/${p.team_id}` : `/handbook/${p.slug}`);
</script>

<PageHead title="Handbook" sub="How the club works, each thing written once. If anything else says something different, this is right.">
	{#snippet actions()}
		<a class="btn" href="/handbook/constitution" data-sveltekit-reload>Constitution</a>
		{#if data.website}<a class="btn" href="/site">Website text</a>{/if}
	{/snippet}
</PageHead>

{#each data.areas as area (area.name)}
	<section class="card kb-area" aria-label={area.name}>
		<h2 class="section-title">{area.name}</h2>
		<ul class="kb-list">
			{#each area.pages as p (p.id)}
				<li>
					<a href={href(p)}>{p.title}</a>
					<span class="hint">
						{#if p.audience === 'execs'}Execs only · {/if}{p.edited_at ? `Changed ${formatTimestamp(p.edited_at, data.zone)}` : 'Not written yet'}
					</span>
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<Empty>Nothing here yet.</Empty>
{/each}

{#if exec}
	<details class="card disclose kb-new">
		<summary>New page</summary>
		<form method="post" action="?/create" class="stack">
			<div class="kb-new-fields">
				<Field label="Title"><input name="title" maxlength={120} required /></Field>
				<Field label="Section" hint="Pick one or type a new one.">
					<input name="area" maxlength={60} list="kb-areas" />
					<datalist id="kb-areas">{#each data.areas as a}<option value={a.name}></option>{/each}</datalist>
				</Field>
				<Field label="Who can read it">
					<select name="audience"><option value="members">Every member</option><option value="execs">Execs only</option></select>
				</Field>
			</div>
			<div><button class="btn primary">Create and write it</button></div>
		</form>
	</details>
	{#if data.removed.length}
		<details class="card disclose kb-new">
			<summary>Removed pages ({data.removed.length})</summary>
			<ul class="kb-list">
				{#each data.removed as p (p.id)}
					<li class="kb-removed">
						<span>{p.title} <span class="hint">· Removed {formatTimestamp(p.removed_at, data.zone)}</span></span>
						<form method="post" action="?/restore">
							<input type="hidden" name="id" value={p.id} />
							<button class="btn small" aria-label="Put back {p.title}">Put back</button>
						</form>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/if}

<style>
	.kb-area, .kb-new { margin-bottom: 16px; max-width: 46rem; }
	.kb-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.kb-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
	.kb-list a { font-weight: 600; overflow-wrap: anywhere; }
	.kb-removed { justify-content: space-between; }
	.kb-new-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
	@media (max-width: 640px) {
		.kb-new-fields { grid-template-columns: minmax(0, 1fr); }
	}
</style>
