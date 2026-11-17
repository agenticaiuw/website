<script lang="ts">
	import { site } from '$lib/site';
	const { reasons } = site();
	import Badge from './Badge.svelte';
</script>

<!-- Home page, under the vision: what sets the club apart. -->
<section id="why" class="why scroll-mt-20" aria-labelledby="why-heading">
	<div class="shell">
		<div class="head" data-reveal>
			<Badge size={92} prop="architecture" class="head-badge" />
			<h2 id="why-heading">{reasons.heading}</h2>
		</div>
		<ol class="grid" role="list" data-stagger>
			{#each reasons.items as r, i (r.title)}
				<li data-reveal class="card reason" class:wide={i === 0}>
					<span class="index-numeral" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
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
	.why { padding: clamp(4.5rem, 9vw, 7rem) 0; }
	.head { display: flex; align-items: center; gap: 1rem; }
	.head h2 { font-size: clamp(2rem, 4.4vw, 3.1rem); }
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
		gap: 1rem;
		margin-top: clamp(2rem, 4vw, 2.75rem);
		list-style: none;
		padding: 0;
	}
	.reason { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.6rem; min-width: 0; }
	.reason.wide { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.reason h3 { font-size: 1.4rem; line-height: 1.2; }
	.reason p { font-size: 1rem; line-height: 1.6; color: var(--muted); }
	.more { display: inline-block; margin-left: 0.25rem; font-weight: 600; color: var(--accent); }
	.more:hover { text-decoration: underline; text-underline-offset: 3px; }
	@media (min-width: 1024px) {
		.grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
		.reason { grid-column: span 2; }
		.reason.wide { grid-column: span 3; }
		.reason:nth-child(2) { grid-column: span 3; }
	}
	@media (max-width: 480px) {
		.head :global(.head-badge) { width: 68px !important; }
	}
</style>
