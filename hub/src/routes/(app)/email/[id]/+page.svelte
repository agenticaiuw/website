<script lang="ts">
	import { fitFrame } from '$lib/actions.js';
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const r = $derived(data.email);
</script>

<PageHead eyebrow="Email" title={r.subject} sub={formatTimestamp(r.created_at, data.zone)}>
	{#snippet actions()}<a class="btn ghost" href="/email">Back</a>{/snippet}
</PageHead>
<dl class="facts card">
	<div class="wide">
		<dt>To</dt>
		<dd class="break">{r.to}</dd>
	</div>
	<div>
		<dt>Type</dt>
		<dd>{r.kind}</dd>
	</div>
	<div>
		<dt>Status</dt>
		<dd>
			<span class="pill mail-{r.status}">{r.status}</span>
			{#if r.error}<div class="small bad">{r.error}</div>{/if}
		</dd>
	</div>
</dl>
{#if r.html}
	<!-- No scripts run inside; links open in a new tab. -->
	<iframe class="email-preview" title={r.subject} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc={r.html} use:fitFrame></iframe>
{:else}
	<Empty>Sent before the hub kept copies of emails, so only the subject was saved.</Empty>
{/if}
