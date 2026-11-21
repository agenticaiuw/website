<script lang="ts">
	import { liveCount } from '$lib/actions.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const m = $derived(data.meeting);
	const f = $derived(data.form);
</script>

<main class="screen">
	<div class="screen-qr">{@html data.qr}</div>
	<div class="screen-info">
		<p class="eyebrow">{m.title}</p>
		<h1>{f.title}</h1>
		<p class="screen-url">{data.url}</p>
		<p class="screen-count">
			<span data-live-count="/meetings/{m.id}/form/count" use:liveCount>{f.responses}</span>
			<span data-live-of></span>
		</p>
		<p class="screen-label">filled out{f.closed ? ' · closed' : ''}</p>
		<p class="screen-tools js-only">
			<label>People here <input type="number" min="0" max="999" inputmode="numeric" data-live-total={String(f.id)} /></label>
			<a href="/meetings/{m.id}#form">Back to the meeting</a>
		</p>
	</div>
</main>
