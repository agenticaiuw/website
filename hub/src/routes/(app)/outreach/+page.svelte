<script lang="ts">
	import { submitOnSelect } from '$lib/actions.js';
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Fields from './Fields.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const f = $derived(data.filter);
	const filtered = $derived(!!(f.q || f.status || f.kind));
</script>

<PageHead title="Outreach" sub="Companies, faculty, campus offices and others outside the club. Only execs see this, and none of them are on the newsletter list." />
<form class="toolbar" method="get" action="/outreach" use:submitOnSelect>
	<select name="status" aria-label="Status">
		<option value="" selected={!f.status}>Any status</option>
		{#each data.options.statuses as s (s)}<option value={s} selected={f.status === s}>{s}</option>{/each}
	</select>
	<select name="kind" aria-label="Kind">
		<option value="" selected={!f.kind}>Any kind</option>
		{#each data.options.kinds as k (k)}<option value={k} selected={f.kind === k}>{k}</option>{/each}
	</select>
	<input type="search" name="q" value={f.q} placeholder="Search outreach" aria-label="Search outreach" />
	<button class="btn js-hide">Filter</button>
</form>
<p class="muted small">{filtered ? `${data.rows.length} of ${data.total}` : data.total} {data.total === 1 ? 'contact' : 'contacts'}</p>
<div class="stack">
{#if data.rows.length}
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Organization</th>
					<th class="wide-only">Kind</th>
					<th>Status</th>
					<th class="wide-only">Priority</th>
					<th class="wide-only">Handled by</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as r (r.id)}
					<tr>
						<td class="clip">
							<a href="/outreach/{r.id}">{r.organization || r.name}</a>
							{#if r.organization && r.name}<div class="muted small">{r.name}</div>{/if}
							{#if r.email}<div class="muted small">{r.email}</div>{/if}
						</td>
						<td class="wide-only">{r.kind}</td>
						<td>{r.status}</td>
						<td class="wide-only">{r.priority}</td>
						<td class="wide-only">{r.owner}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<Empty>{filtered ? 'No contacts match.' : 'No contacts yet.'}</Empty>
{/if}
<details class="card disclose">
	<summary>Add a contact</summary>
	<form method="post" action="?/add" class="stack">
		<Fields options={data.options} />
		<div><button class="btn primary">Add</button></div>
	</form>
</details>
</div>

<style>
	/* On a phone, the name and status fit; the rest is on each contact's page. */
	@media (max-width: 640px) {
		.wide-only {
			display: none;
		}
	}
</style>
