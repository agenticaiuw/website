<script lang="ts">
	import { site } from '$lib/site';
	const { reasons } = site();
	import Badge from './Badge.svelte';
</script>

<!-- Home page slide: why the club was started, all five reasons on one screen. -->
<section id="why" class="slide why scroll-mt-20" aria-labelledby="why-heading">
	<div class="shell">
		<header class="head" data-reveal>
			<Badge size="100%" prop="architecture" class="head-badge" />
			<h2 id="why-heading" class="slide-title">{reasons.heading}</h2>
		</header>
		<ol class="grid" role="list" data-stagger>
			{#each reasons.items as r, i (r.title)}
				<li data-reveal class="card reason" class:first={i === 0}>
					<span class="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
					<h3>{r.title}</h3>
					<p>
						{r.body}
						{#if r.link}
							<a href={r.link.href} class="more">{r.link.label} <span aria-hidden="true">→</span></a>
						{/if}
					</p>
				</li>
			{/each}
		</ol>
	</div>
</section>

<style>
	.head { display: flex; align-items: center; gap: clamp(0.75rem, 2vw, 1.25rem); }
	.head :global(.head-badge) { flex: none; width: clamp(3.25rem, 9svh, 5.25rem) !important; }

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: clamp(0.75rem, 1.6svh, 1rem);
		margin-top: clamp(1.25rem, 4svh, 2.5rem);
		list-style: none;
		padding: 0;
	}
	.reason {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-content: start;
		column-gap: clamp(0.7rem, 1.4vw, 1rem);
		min-width: 0;
		padding: clamp(1.1rem, min(2vw, 3.2svh), 1.75rem);
		transition: border-color 0.2s ease;
	}
	.reason:hover { border-color: var(--line-strong); }
	.reason.first { grid-column: 1 / -1; background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.num {
		font-family: var(--font-sans);
		font-size: clamp(1.9rem, min(3.4vw, 6svh), 3.1rem);
		font-weight: 900;
		line-height: 0.85;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
		color: var(--accent);
	}
	.reason h3 {
		align-self: center;
		font-family: var(--font-sans);
		font-size: clamp(1.15rem, min(1.75vw, 3.2svh), 1.6rem);
		font-weight: 800;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	.reason p {
		grid-column: 1 / -1;
		margin-top: clamp(0.5rem, 1.4svh, 0.85rem);
		font-size: clamp(0.98rem, min(1.15vw, 2.2svh), 1.1rem);
		line-height: 1.55;
		color: var(--muted);
	}
	.more { display: inline-block; margin-left: 0.25rem; font-weight: 700; color: var(--accent); }
	.more:hover { text-decoration: underline; text-underline-offset: 3px; }

	/* Wide screens: two big cards on top, three below. */
	@media (min-width: 1024px) {
		.grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
		.reason { grid-column: span 2; }
		.reason.first, .reason:nth-child(2) { grid-column: span 3; }
	}
	@media (max-width: 640px) {
		.grid { grid-template-columns: minmax(0, 1fr); }
	}
</style>
