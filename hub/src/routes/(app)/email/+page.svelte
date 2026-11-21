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
		Email isn't connected yet. Create a Google app password for {data.from} and save it with <code>npx wrangler secret put SMTP_PASSWORD</code>. Until then, nothing is delivered.
	</p>
{/if}
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
