<script lang="ts">
	import type { Snippet } from 'svelte';
	import Badge from './Badge.svelte';
	interface Props {
		id: string;
		heading: string;
		lede?: string;
		/** Centre the heading and lede. Opt-in per page. */
		center?: boolean;
		/** badge beside the heading, holding a team prop or waving. */
		mascot?: { prop?: string; wave?: boolean; mood?: 'rest' | 'happy' };
		children: Snippet;
		/** Full-width content after the body, such as a sideways gallery. */
		bleed?: Snippet;
	}
	let { id, heading, lede, center = false, mascot, children, bleed }: Props = $props();
</script>

<!-- A page's first slide: its heading, then the content that belongs with it. -->
<section {id} class="slide page-section scroll-mt-20">
	<div class="shell">
		<header class="section-intro" class:center class:with-mascot={!!mascot}>
			<div class="intro-text">
				<!-- Each page opens with one Section, so its heading is the page's h1. -->
				<h1 class="slide-title" data-reveal>{heading}</h1>
				{#if lede}
					<p data-reveal class="lede">{lede}</p>
				{/if}
			</div>
			{#if mascot}
				<div class="intro-mascot" aria-hidden="true" data-pop>
					<Badge size="100%" prop={mascot.prop} wave={mascot.wave} mood={mascot.mood ?? 'happy'} />
				</div>
			{/if}
		</header>

		<div class="section-body">
			{@render children()}
		</div>
	</div>
	{#if bleed}{@render bleed()}{/if}
</section>

<style>
	.section-intro { display: grid; gap: 1rem 3rem; align-items: center; }
	.section-intro.with-mascot { grid-template-columns: minmax(0, 1fr) clamp(5.5rem, min(15vw, 16svh), 11rem); }
	.intro-text { max-width: 50rem; }
	.center .intro-text { margin-inline: auto; text-align: center; }
	.lede { margin-top: clamp(0.6rem, 2svh, 1.1rem); max-width: 42rem; font-size: clamp(1rem, min(1.5vw, 2.6svh), 1.25rem); line-height: 1.55; color: var(--muted); }
	.center .lede { margin-inline: auto; }
	.intro-mascot { width: 100%; }

	.section-body { margin-top: clamp(1rem, 3.2svh, 2.75rem); }

	@media (max-width: 640px) {
		/* phones: the mascot sits small beside the heading's top line */
		.section-intro.with-mascot { grid-template-columns: minmax(0, 1fr) clamp(4.25rem, 20vw, 5.5rem); align-items: start; gap: 0.75rem; }
	}
</style>
