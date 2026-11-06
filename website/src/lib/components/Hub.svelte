<script lang="ts">
	import AgentGraph from './AgentGraph.svelte';
	import PressFeature from './PressFeature.svelte';
	import Reasons from './Reasons.svelte';
	import ExecTeam from './ExecTeam.svelte';
	import { club, vision, stats } from '$lib/content';
</script>

<section class="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pt-24 pb-16">
	<AgentGraph />
	<div
		class="pointer-events-none absolute inset-0"
		style:background="radial-gradient(115% 80% at 50% 42%, transparent 0%, color-mix(in oklab, var(--bg) 62%, transparent) 52%, var(--bg) 100%)"
		aria-hidden="true"
	></div>

	<div class="shell relative w-full">
		<!-- The nav bar already shows the name, so the page's h1 is for search
		     engines and screen readers only. -->
		<h1 class="sr-only">{club.name}</h1>

		<!-- the vision: the first thing a visitor reads -->
		<section class="vision" aria-labelledby="vision-label">
			<h2 id="vision-label" class="vision-label">{vision.label}</h2>
			<p class="vision-text mt-4">
				{#each vision.runs as r, i (i)}{#if r.strong}<strong>{r.t}</strong>{:else}{r.t}{/if}{#if r.cite}<sup class="vision-cite"><a href={vision.source.href} target="_blank" rel="noopener noreferrer" aria-label="Source: {vision.source.label} (opens in a new tab)">[1]</a></sup>{/if}{/each}
			</p>
		</section>

		<!-- community size -->
		<div class="mt-9 max-w-[46rem] md:mt-10">
			<dl class="grid grid-cols-3 border-y" style:border-color="var(--line)">
				{#each stats.items as s, i (s.label)}
					<!-- dt first for screen readers; the number sits on top visually -->
					<div class="flex min-w-0 flex-col-reverse justify-end py-4 pr-3 md:py-5 {i ? 'border-l pl-4 md:pl-7' : ''}" style:border-color="var(--line)">
						<dt class="mt-1.5 text-[0.8rem] leading-snug md:text-sm" style:color="var(--muted)">{s.label}</dt>
						<dd class="stat-value">{#if s.approx}<span aria-hidden="true">~</span><span class="sr-only">nearly </span>{/if}{s.n}</dd>
					</div>
				{/each}
			</dl>
		</div>

		<div class="mt-10 md:mt-12">
			<PressFeature />
		</div>
	</div>
</section>

<Reasons />

<ExecTeam />

<style>
	.vision { max-width: 60rem; animation: vision-appear 650ms var(--ease-out-expo) backwards; }
	.vision-label {
		font-family: var(--font-mono);
		font-size: clamp(1rem, 1.7vw, 1.25rem);
		font-weight: 500;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.vision-text {
		font-size: clamp(1.28rem, 2.35vw, 1.85rem);
		line-height: 1.38;
		letter-spacing: -0.02em;
		text-wrap: pretty;
		color: var(--fg);
	}
	.vision-text strong { font-weight: 600; color: var(--fg); }
	.vision-cite { font-size: 0.5em; line-height: 0; margin-left: 0.1em; }
	.vision-cite a { color: var(--muted); text-decoration: none; }
	.vision-cite a:hover, .vision-cite a:focus-visible { color: var(--accent); }
	.stat-value {
		font-size: clamp(1.6rem, 4vw, 2.5rem);
		font-weight: 500;
		line-height: 1.1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}

	@keyframes vision-appear {
		from { opacity: 0; transform: translateY(6px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@media (prefers-reduced-motion: reduce) {
		.vision { animation: none; }
	}
</style>
