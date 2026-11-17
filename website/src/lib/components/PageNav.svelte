<script lang="ts">
	import { page } from '$app/state';
	import { site } from '$lib/site';
	const { nav } = site();

	const idx = $derived(nav.findIndex((n) => n.href === page.url.pathname.replace(/\/$/, '') || n.href + '/' === page.url.pathname));
	const prev = $derived(idx > 0 ? nav[idx - 1] : null);
	const next = $derived(idx >= 0 && idx < nav.length - 1 ? nav[idx + 1] : null);
</script>

<nav class="page-nav" aria-label="Section navigation">
	<div class="shell grid gap-3 sm:grid-cols-2">
		{#if prev}
			<a href={prev.href} class="group pn-card">
				<svg class="shrink-0 transition-transform duration-200 group-hover:-translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
				<span class="min-w-0">
					<span class="eyebrow block">Previous</span>
					<span class="pn-label">{prev.label}</span>
				</span>
			</a>
		{:else}
			<a href="/" class="group pn-card">
				<svg class="shrink-0 transition-transform duration-200 group-hover:-translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
				<span><span class="eyebrow block">Back to</span><span class="pn-label">Home</span></span>
			</a>
		{/if}

		{#if next}
			<a href={next.href} class="group pn-card next">
				<span class="min-w-0">
					<span class="eyebrow block">Next</span>
					<span class="pn-label">{next.label}</span>
				</span>
				<svg class="shrink-0 transition-transform duration-200 group-hover:translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
			</a>
		{/if}
	</div>
</nav>

<style>
	.page-nav { padding: 0 0 2.5rem; }
	.pn-card { display: flex; align-items: center; gap: 1rem; min-width: 0; padding: 1.1rem 1.35rem; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); transition: transform .3s var(--ease-spring), border-color .2s ease; }
	.pn-card.next { justify-content: flex-end; text-align: right; }
	.pn-card:hover { transform: translateY(-3px); border-color: var(--line-strong); }
	.pn-card .eyebrow { font-size: .9rem; }
	.pn-label { display: block; margin-top: .1rem; font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; line-height: 1.25; color: var(--fg); }
</style>
