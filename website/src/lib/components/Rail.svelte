<script lang="ts">
	import type { Snippet } from 'svelte';
	/* A row of cards that scrolls sideways: it starts in line with the page's
	   text, runs off the right edge, and the arrows step it a card at a time.
	   Each <li> passed in is one card; --rail-card sets the card width. */
	let { label, children }: { label?: string; children: Snippet } = $props();

	let rail: HTMLUListElement | undefined = $state();
	let atStart = $state(true);
	let atEnd = $state(false);
	const update = () => {
		if (!rail) return;
		atStart = rail.scrollLeft < 4;
		atEnd = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 4;
	};
	const step = (dir: number) => {
		if (!rail) return;
		const card = rail.querySelector('li');
		const by = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap || '16') : rail.clientWidth * 0.8;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		rail.scrollBy({ left: dir * by, behavior: still ? 'auto' : 'smooth' });
	};
	$effect(() => {
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});
</script>

<ul class="rail" role="list" aria-label={label} data-stagger="x" bind:this={rail} onscroll={update}>
	{@render children()}
</ul>

<div class="shell arrows" class:hidden={atStart && atEnd}>
	<button type="button" class="arrow" onclick={() => step(-1)} disabled={atStart} aria-label="Previous">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
	</button>
	<button type="button" class="arrow" onclick={() => step(1)} disabled={atEnd} aria-label="Next">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
	</button>
</div>

<style>
	.rail {
		--gutter: max(clamp(1.25rem, 5vw, 4rem), calc((100% - 78rem) / 2 + clamp(1.25rem, 5vw, 4rem)));
		display: flex;
		gap: 1rem;
		margin: 0;
		padding: 0.5rem var(--gutter) 1.5rem;
		list-style: none;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: var(--gutter);
		scrollbar-width: none;
	}
	.rail::-webkit-scrollbar { display: none; }
	.rail > :global(li) {
		flex: none;
		width: var(--rail-card, clamp(15rem, 21vw, 18.5rem));
		min-width: 0;
		scroll-snap-align: start;
	}

	.arrows { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: -0.5rem; }
	.arrows.hidden { display: none; }
	.arrow {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 999px;
		border: 1.5px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--fg);
		transition: border-color 0.2s ease, opacity 0.2s ease;
	}
	.arrow:hover:not(:disabled), .arrow:focus-visible { border-color: var(--fg); }
	.arrow:disabled { opacity: 0.35; cursor: default; }

	@media (max-height: 700px) {
		.rail { padding-bottom: 1.25rem; }
		.arrows { margin-top: -0.25rem; }
	}
</style>
