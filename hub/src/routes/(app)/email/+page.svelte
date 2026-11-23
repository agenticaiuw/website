<script lang="ts">
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PageHead title="Email history" sub="Everything the hub has sent from {data.from}, newest first." />
{#if data.dev}
	<p class="callout">Local dev mode: emails are written to this log and the terminal, not sent.</p>
{:else if !data.configured}
	<p class="flash err">
		Email isn't connected yet: the Worker has no EMAIL sending binding. Until it does, nothing is delivered.
	</p>
{/if}
<section class="card stack google" id="google">
	<h2 class="section-title">Google Group</h2>
	{#if data.google.error}<p class="flash err">{data.google.error}</p>{/if}
	{#if !data.google.configured}
		<p class="muted small">The hub's Google sign-in client isn't set up yet, so website signups wait on the newsletter list.</p>
	{:else if data.google.connected}
		<p>Website newsletter signups are added to {data.google.group}{data.google.account ? `, signed in as ${data.google.account}` : ''}.</p>
		<p class="muted small">{data.google.added} added, {data.google.waiting} waiting.</p>
		<div><a class="btn" href="/google/connect" data-sveltekit-reload>Connect again</a></div>
	{:else}
		<p>Sign in with a Google account that owns or manages {data.google.group}, and the hub adds every website newsletter signup to it.</p>
		{#if data.google.waiting}<p class="muted small">{data.google.waiting} waiting.</p>{/if}
		<div><a class="btn primary" href="/google/connect" data-sveltekit-reload>Connect</a></div>
	{/if}
	{#if data.google.failed.length}
		<details class="disclose">
			<summary>Google refused {data.google.failed.length}</summary>
			<ul class="small">
				{#each data.google.failed as f (f.id)}<li><strong>{f.email}</strong>: {f.group_error}</li>{/each}
			</ul>
		</details>
	{/if}
</section>

<h2 class="section-title">Sent</h2>
{#if data.log.length}
	<div class="table-wrap">
		<table class="table mail-log">
			<thead>
				<tr>
					<th>When</th>
					<th>To</th>
					<th>Type</th>
					<th>Subject</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each data.log as r}
					<tr>
						<td class="nowrap small">{formatTimestamp(r.created_at, data.zone)}</td>
						<td class="small">{r.to_email}</td>
						<td class="small">{r.kind}</td>
						<td class="mail-subject"><a href="/email/{r.id}">{r.subject}</a></td>
						<td>
							<span class="pill mail-{r.status}" title={r.error || undefined}>{r.status}</span>
							{#if r.error}<div class="small bad">{r.error}</div>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<Empty>No emails yet.</Empty>
{/if}

<style>
	.google {
		margin-bottom: 1.5rem;
	}
	.google ul {
		margin: 0.5rem 0 0;
		padding-left: 1.1rem;
		overflow-wrap: anywhere;
	}
</style>
