<script lang="ts">
	import { page } from '$app/state';
	import { nav } from '$lib/content';

	const idx = $derived(nav.findIndex((n) => n.href === page.url.pathname.replace(/\/$/, '') || n.href + '/' === page.url.pathname));
	const prev = $derived(idx > 0 ? nav[idx - 1] : null);
	const next = $derived(idx >= 0 && idx < nav.length - 1 ? nav[idx + 1] : null);
</script>

<nav class="border-t py-10" style:border-color="var(--line)" aria-label="Section navigation">
	<div class="shell grid gap-4 sm:grid-cols-2">
		{#if prev}
			<a href={prev.href} class="group flex items-center gap-4 rounded-lg border p-5 transition-transform duration-200 hover:-translate-y-0.5" style:border-color="var(--line)">
				<svg class="shrink-0 transition-transform duration-200 group-hover:-translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
				<span class="min-w-0">
					<span class="eyebrow block">Previous</span>
					<span class="mt-1 block truncate">{prev.label}</span>
				</span>
			</a>
		{:else}
			<a href="/" class="group flex items-center gap-4 rounded-lg border p-5 transition-transform duration-200 hover:-translate-y-0.5" style:border-color="var(--line)">
				<svg class="shrink-0 transition-transform duration-200 group-hover:-translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
				<span><span class="eyebrow block">Back to</span><span class="mt-1 block">Home</span></span>
			</a>
		{/if}

		{#if next}
			<a href={next.href} class="group flex items-center justify-end gap-4 rounded-lg border p-5 text-right transition-transform duration-200 hover:-translate-y-0.5" style:border-color="var(--line)">
				<span class="min-w-0">
					<span class="eyebrow block">Next</span>
					<span class="mt-1 block truncate">{next.label}</span>
				</span>
				<svg class="shrink-0 transition-transform duration-200 group-hover:translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
			</a>
		{/if}
	</div>
</nav>
