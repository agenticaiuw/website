<script lang="ts">
	import Badge from './Badge.svelte';
	interface Props {
		id: string;
		heading: string;
		lede?: string;
		/** Centre the heading and lede. Opt-in per page. */
		center?: boolean;
		illuminated?: boolean;
		/** badge beside the heading, holding a team prop or waving. */
		mascot?: { prop?: string; wave?: boolean; mood?: 'rest' | 'happy' };
		background?: import('svelte').Snippet;
		children: import('svelte').Snippet;
	}
	let { id, heading, lede, center = false, illuminated = false, mascot, background, children }: Props = $props();
</script>

<section {id} class="page-section scroll-mt-20" class:illuminated>
	{#if background}<div class="section-atmosphere" aria-hidden="true">{@render background()}</div>{/if}
	<div class="shell foreground">
		<header class="section-intro" class:center class:with-mascot={!!mascot}>
			<div class="intro-text">
				<!-- Each page opens with one Section, so its heading is the page's h1. -->
				<h1 data-reveal>{heading}</h1>
				{#if lede}
					<p data-reveal class="lede">{lede}</p>
				{/if}
			</div>
			{#if mascot}
				<div class="intro-mascot" aria-hidden="true">
					<Badge size="100%" prop={mascot.prop} wave={mascot.wave} mood={mascot.mood ?? 'happy'} />
				</div>
			{/if}
		</header>

		<div class="section-body">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.page-section { position: relative; isolation: isolate; padding: clamp(7rem, 12vw, 9rem) 0 clamp(4.5rem, 9vw, 7rem); }
	.illuminated { overflow: clip; }
	.illuminated::before { content: ''; position: absolute; inset: 0 0 auto; height: 40rem; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 85% 8%, rgb(var(--glow) / .1), transparent 62%); }
	.section-atmosphere { position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: .8; mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 70%, transparent); }
	.foreground { position: relative; }

	.section-intro { display: grid; gap: 1.5rem 3rem; align-items: center; }
	.section-intro.with-mascot { grid-template-columns: minmax(0, 1fr) clamp(8rem, 18vw, 13rem); }
	.intro-text { max-width: 48rem; }
	.center .intro-text { margin-inline: auto; text-align: center; }
	h1 { font-size: clamp(2.4rem, 6vw, 4.2rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.02em; }
	.lede { margin-top: 1.1rem; max-width: 40rem; font-size: clamp(1.05rem, 1.6vw, 1.2rem); line-height: 1.6; color: var(--muted); }
	.center .lede { margin-inline: auto; }
	.intro-mascot { width: 100%; animation: pop 700ms var(--ease-spring) 100ms backwards; }
	.illuminated .intro-text { position: relative; }
	.illuminated .intro-text::before { content: ''; position: absolute; inset: -1.2rem -1.5rem; z-index: -1; pointer-events: none; background: var(--bg); opacity: .9; filter: blur(26px); }

	.section-body { margin-top: clamp(2.5rem, 5vw, 3.5rem); }

	@keyframes pop {
		from { opacity: 0; transform: scale(.9) rotate(-4deg); }
		to { opacity: 1; transform: none; }
	}
	@media (max-width: 640px) {
		.section-intro.with-mascot { grid-template-columns: minmax(0, 1fr); }
		.intro-mascot { order: -1; width: 7.5rem; }
	}
	@media (prefers-reduced-motion: reduce) { .intro-mascot { animation: none; } }
</style>
