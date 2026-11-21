<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import PostButton from '$lib/components/PostButton.svelte';
	import Fields from '../Fields.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const r = $derived(data.row);
	const sub = $derived([r.organization && r.name, r.kind, r.region].filter(Boolean).join(' · '));
</script>

<PageHead eyebrow="Outreach" title={r.organization || r.name} sub={sub || false}>
	{#snippet actions()}<a class="btn ghost" href="/outreach">Back</a>{/snippet}
</PageHead>
<div class="grid-2 wide-left">
	<form method="post" action="?/save" class="card stack">
		<Fields options={data.options} row={r} />
		<div><button class="btn primary">Save</button></div>
	</form>
	<div class="stack">
		{#if r.email || data.href}
		<dl class="facts card">
			{#if r.email}
				<div class="wide">
					<dt>Email</dt>
					<dd class="break"><a href="mailto:{r.email}">{r.email}</a></dd>
				</div>
			{/if}
			{#if data.href}
				<div class="wide">
					<dt>Link</dt>
					<dd class="break"><a href={data.href} target="_blank" rel="noopener noreferrer">{data.href}</a></dd>
				</div>
			{/if}
		</dl>
		{/if}
		<div><PostButton action="?/delete" label="Delete contact" cls="btn danger" confirm="Delete this contact? This can't be undone." /></div>
	</div>
</div>
