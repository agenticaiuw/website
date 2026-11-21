<script lang="ts">
	import Choice from '$lib/components/Choice.svelte';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { formatDate, formatTimestamp } from '$lib/dates';
	import { isExec } from '$lib/perm';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const exec = $derived(isExec(data.viewer));
	const empty = { official: 'No official decisions yet.', open: 'Everything is decided.', dropped: 'Nothing has been dropped.' };
</script>

<PageHead title="Decisions">
	{#snippet sub()}The club's official decisions. If a doc, a message or anything else says otherwise, this page is right.{/snippet}
	{#snippet actions()}
		{#if exec && data.counts.open}<a class="btn primary" href="/decisions/review">Decide ({data.counts.open} open)</a>{/if}
	{/snippet}
</PageHead>

{#if exec}
	<div class="decisions-tabs">
		<Tabs
			label="Show"
			options={[
				['official', `Official ${data.counts.official}`],
				['open', `Open ${data.counts.open}`],
				['dropped', `Dropped ${data.counts.dropped}`]
			]}
			current={data.show}
			href={(s) => (s === 'official' ? '/decisions' : `/decisions?show=${s}`)}
		/>
	</div>
{/if}

<div class="decisions">
	{#each data.groups as [area, items]}
		<section class="decision-area">
			<h2>{area}</h2>
			<ul class="card decision-list">
				{#each items as d}
					<li>
						<p class="decision-text">
							{#if d.title}<strong>{d.title}.</strong>{/if}
							{d.body || d.context}
							{#if d.exec_only}<span class="tag exec">Execs only</span>{/if}
						</p>
						{#if d.owner || d.starts_on || d.decided_at || exec}
							<p class="decision-meta">
								{#if d.owner}<span>Responsible: {d.owner}</span>{/if}
								{#if d.starts_on}<span>Starts {formatDate(d.starts_on)}</span>{/if}
								{#if d.decided_at}<span>Decided {formatTimestamp(d.decided_at, data.zone)}{d.decided_by_name ? ` by ${d.decided_by_name}` : ''}</span>{/if}
								{#if exec}<a href="/decisions/review?id={d.id}">{d.status === 'open' ? 'Decide' : 'Change'}</a>{/if}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<Empty>{empty[data.show]}</Empty>
	{/each}
</div>

{#if exec}
	<details class="card disclose decisions-add">
		<summary>Add a decision</summary>
		<form method="post" action="?/add" class="stack">
			<div class="field-pair">
				<Field label="Area" hint="Pick one from the list or type a new one.">
					<input name="area" list="decision-areas" maxlength={80} required />
					<datalist id="decision-areas">{#each data.areas as a}<option value={a}></option>{/each}</datalist>
				</Field>
				<Field label="Short name" hint="Optional."><input name="title" maxlength={120} /></Field>
			</div>
			<Field label="Decision"><textarea name="body" rows={3} maxlength={2000} required></textarea></Field>
			<div class="field-pair">
				<Field label="Who's responsible"><MemberSelect name="owner" members={data.people} blank="Nobody yet" /></Field>
				<Field label="Starts"><input type="date" name="starts" /></Field>
			</div>
			<div class="field-pair">
				<Choice name="status" label="Status" selected="official" options={[['official', 'Official'], ['open', 'Still open']]} />
				<Choice name="visible" label="Who sees it" selected="all" options={[['all', 'Every member'], ['execs', 'Execs only']]} />
			</div>
			<div><button class="btn primary">Save</button></div>
		</form>
	</details>
{/if}
