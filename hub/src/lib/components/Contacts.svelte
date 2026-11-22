<script lang="ts">
	import { submitOnSelect } from '$lib/actions.js';
	import type { ContactsSection } from '$lib/server/outreach';
	import Empty from './Empty.svelte';
	import OutreachFields from './OutreachFields.svelte';

	/** Companies, faculty, campus offices and others outside the club, on the Business team's page. */
	let { data, root }: { data: ContactsSection; root: string } = $props();
	const f = $derived(data.filter);
	const filtered = $derived(!!(f.q || f.status || f.kind));
</script>

<section class="stack" id="contacts">
	<h2 class="section-title">Contacts <span class="count">{data.total}</span></h2>
	<p class="muted small">Only execs and the Business team see these, and none of them are on the newsletter list.</p>
	<form class="toolbar" method="get" action="{root}#contacts" use:submitOnSelect>
		<select name="contact_status" aria-label="Status">
			<option value="" selected={!f.status}>Any status</option>
			{#each data.options.statuses as s (s)}<option value={s} selected={f.status === s}>{s}</option>{/each}
		</select>
		<select name="contact_kind" aria-label="Kind">
			<option value="" selected={!f.kind}>Any kind</option>
			{#each data.options.kinds as k (k)}<option value={k} selected={f.kind === k}>{k}</option>{/each}
		</select>
		<input type="search" name="contact_q" value={f.q} placeholder="Search contacts" aria-label="Search contacts" />
		<button class="btn js-hide">Filter</button>
	</form>
	{#if filtered}<p class="muted small">{data.rows.length} of {data.total}</p>{/if}
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
		<form method="post" action="/outreach?/add" class="stack">
			<OutreachFields options={data.options} />
			<div><button class="btn primary">Add</button></div>
		</form>
	</details>
</section>

<style>
	/* On a phone, the name and status fit; the rest is on each contact's page. */
	@media (max-width: 640px) {
		.wide-only {
			display: none;
		}
	}
</style>
