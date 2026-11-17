<script lang="ts">
	import AgentGraph from './AgentGraph.svelte';
	import PressFeature from './PressFeature.svelte';
	import Reasons from './Reasons.svelte';
	import ExecTeam from './ExecTeam.svelte';
	import Badge from './Badge.svelte';
	import { site } from '$lib/site';
	const { club, vision, stats } = site();
</script>

<section class="hero">
	<div class="graph" aria-hidden="true"><AgentGraph /></div>
	<div class="fade" aria-hidden="true"></div>

	<div class="shell hero-inner">
		<!-- the home headline, the first thing a visitor reads: the big line across the page, then the statement.
		     The nav bar already shows the club's name, so the h1 says it to search engines and screen readers only. -->
		<header class="vision">
			<h1 class="headline"><span class="sr-only">{`${club.name}: `}</span>{#each vision.labelRuns as r, i (i)}{#if r.strong}<span class="hl">{r.t}</span>{:else}{r.t}{/if}{/each}</h1>
			<p class="vision-text">
				{#each vision.runs as r, i (i)}{#if r.strong}<strong>{r.t}</strong>{:else}{r.t}{/if}{#if r.cite}<sup class="vision-cite"><a href={vision.source.href} target="_blank" rel="noopener noreferrer" aria-label="Source: {vision.source.label} (opens in a new tab)">[1]</a></sup>{/if}{/each}
			</p>
		</header>

		<!-- community size, with the mascot waving beside it -->
		<div class="community">
			<dl class="stats">
				{#each stats.items as s (s.label)}
					<!-- dt first for screen readers; the number sits on top visually -->
					<div class="stat">
						<dt>{s.label}</dt>
						<dd>{#if s.approx}<span aria-hidden="true">~</span><span class="sr-only">nearly </span>{/if}{s.n}</dd>
					</div>
				{/each}
			</dl>
			<div class="mascot" aria-hidden="true">
				<Badge size="100%" wave mood="happy" class="mascot-badge" />
			</div>
		</div>

		<div class="press">
			<PressFeature />
		</div>
	</div>
</section>

<Reasons />

<ExecTeam />

<style>
	.hero {
		position: relative;
		isolation: isolate;
		overflow: clip;
		padding: 7.5rem 0 4.5rem;
	}
	.graph { position: absolute; inset: 0; z-index: -2; opacity: 0.55; }
	.fade {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background:
			radial-gradient(60% 55% at 78% 38%, rgb(var(--glow) / 0.12), transparent 70%),
			radial-gradient(120% 85% at 40% 40%, transparent 0%, color-mix(in oklab, var(--bg) 70%, transparent) 55%, var(--bg) 100%);
	}

	.vision { animation: rise 650ms var(--ease-out-expo) backwards; }
	/* Square-cut capitals, not the rounded display face: this line is the club's claim. */
	.headline {
		font-family: var(--font-sans);
		font-size: clamp(2.1rem, 12vw, 9rem);
		font-weight: 900;
		line-height: 0.92;
		letter-spacing: -0.04em;
		text-transform: uppercase;
		text-wrap: balance;
		color: var(--fg);
		text-shadow: 0 0.04em 0.5em rgb(0 0 0 / 0.35);
	}
	.headline .hl { color: var(--accent); }
	.vision-text {
		margin-top: clamp(1.5rem, 3vw, 2.25rem);
		max-width: 44rem;
		font-family: var(--font-sans);
		font-size: clamp(1.15rem, 1.7vw, 1.45rem);
		font-weight: 500;
		line-height: 1.45;
		color: var(--fg);
	}
	.vision-text strong { font-weight: 800; }
	.vision-cite { font-size: 0.5em; line-height: 0; margin-left: 0.1em; }
	.vision-cite a { color: var(--muted); }
	.vision-cite a:hover, .vision-cite a:focus-visible { color: var(--accent); }

	.community {
		display: flex;
		align-items: flex-end;
		gap: clamp(0.75rem, 2vw, 1.5rem);
		margin-top: clamp(2.5rem, 5vw, 3.5rem);
	}
	.mascot {
		position: relative;
		flex: none;
		width: clamp(7.5rem, 11vw, 10rem);
		margin-bottom: -0.35rem;
		animation: pop 800ms var(--ease-spring) 300ms backwards;
	}
	.mascot :global(.mascot-badge) { position: relative; animation: bob 5s ease-in-out infinite; }

	.stats {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		max-width: 46rem;
	}
	.stat {
		display: flex;
		flex-direction: column-reverse;
		justify-content: flex-end;
		min-width: 0;
		padding: 1.1rem 1.25rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: color-mix(in oklab, var(--surface) 88%, transparent);
	}
	.stat dt { margin-top: 0.2rem; font-size: 0.95rem; line-height: 1.35; color: var(--muted); }
	.stat dd {
		font-family: var(--font-display);
		font-size: clamp(2rem, 4.4vw, 2.75rem);
		font-weight: 800;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}
	.press { margin-top: clamp(2rem, 4vw, 2.75rem); }

	@keyframes rise {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@keyframes pop {
		from { opacity: 0; transform: scale(0.92) translateY(10px); }
		to { opacity: 1; transform: none; }
	}
	@keyframes bob {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-8px); }
	}

	@media (max-width: 900px) {
		.hero { padding-top: 6rem; }
	}
	@media (max-width: 560px) {
		.community { flex-direction: column; align-items: stretch; gap: 0.25rem; }
		.mascot { z-index: 1; align-self: flex-end; width: 7.5rem; margin: 0 0.75rem -1.35rem 0; order: -1; }
		.stats { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; }
		.stat { flex-direction: row-reverse; align-items: baseline; justify-content: flex-end; gap: 0.75rem; padding: 0.85rem 1.1rem; }
		.stat dt { margin-top: 0; }
		.stat dd { font-size: 2rem; }
	}
	@media (prefers-reduced-motion: reduce) {
		.vision, .mascot, .mascot :global(.mascot-badge) { animation: none; }
	}
</style>
