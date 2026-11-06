<script lang="ts">
	interface Props {
		id: string;
		heading: string;
		lede?: string;
		/** Centre the heading and lede. Opt-in per page. */
		center?: boolean;
		illuminated?: boolean;
		background?: import('svelte').Snippet;
		children: import('svelte').Snippet;
	}
	let { id, heading, lede, center = false, illuminated = false, background, children }: Props = $props();
</script>

<section {id} class="scroll-mt-16 border-t py-24 md:py-32" class:illuminated style:border-color="var(--line)">
	{#if background}<div class="section-atmosphere" aria-hidden="true">{@render background()}</div>{/if}
	<div class="shell" class:foreground={illuminated}>
		<header class="section-intro">
		<!-- Each page opens with one Section, so its heading is the page's h1. -->
		<h1 data-reveal class:lit-heading={illuminated} class="max-w-3xl text-[clamp(1.9rem,4.4vw,3.1rem)] {center ? 'mx-auto text-center' : ''}">
			{heading}
		</h1>

		{#if lede}
			<p data-reveal class="mt-5 max-w-2xl text-lg leading-relaxed {center ? 'mx-auto text-center' : ''}" style:color="var(--muted)">
				{lede}
			</p>
		{/if}
		</header>

		<div class="mt-14">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.illuminated { position: relative; isolation: isolate; overflow: clip; }
	.illuminated::before { content: ''; position: absolute; inset: 0 0 auto; height: 37rem; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 88% 10%, rgb(var(--glow) / .085), transparent 64%); }
	.section-atmosphere { position: absolute; inset: 0; z-index: -1; pointer-events: none; mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 86%, transparent); }
	.foreground { position: relative; }
	.illuminated .section-intro { position: relative; isolation: isolate; max-width: 52rem; }
	.illuminated .section-intro::before { content: ''; position: absolute; inset: -1.2rem -1.5rem; z-index: -1; pointer-events: none; background: var(--bg); opacity: .93; filter: blur(24px); }
	.lit-heading { background: linear-gradient(115deg, var(--fg) 50%, var(--accent-bright)); background-clip: text; -webkit-background-clip: text; color: transparent; }
</style>
