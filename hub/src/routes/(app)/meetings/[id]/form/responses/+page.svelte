<script lang="ts">
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const m = $derived(data.meeting);
	const rows = $derived(data.rows);
</script>

<PageHead eyebrow="Form · {m.title}" title="{data.formTitle}: {rows.length} {rows.length === 1 ? 'response' : 'responses'}">
	{#snippet actions()}
		<a class="btn" href="/meetings/{m.id}/form/responses.csv" data-sveltekit-reload>Download CSV</a>
		<a class="btn" href="/meetings/{m.id}/form/screen">Show on screen</a>
	{/snippet}
</PageHead>
{#if data.ratings.length > 0 && rows.length > 0}
	<dl class="facts card">
		{#each data.ratings as r (r.q.id)}
			<div>
				<dt>{r.q.label}</dt>
				<dd>{r.n ? `${r.avg.toFixed(1)} / 5 from ${r.n}` : 'No ratings'}</dd>
			</div>
		{/each}
	</dl>
{/if}
{#if rows.length}
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Email</th>
					{#each data.questions as q (q.id)}<th>{q.label}</th>{/each}
					<th>Sent</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.id)}
					<tr>
						<td class="nowrap">{r.name}</td>
						<td>{r.email}</td>
						{#each data.questions as q (q.id)}
							<td class="answer">{#if r.a[q.id] !== undefined}{r.a[q.id]}{:else}<span class="muted">—</span>{/if}</td>
						{/each}
						<td class="nowrap muted">{formatTimestamp(r.updated_at, data.zone)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<Empty>No responses yet.</Empty>
{/if}
