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
		<div class="hero-grid">
			<!-- the home headline, the first thing a visitor reads: the big line, then the statement.
			     The nav bar already shows the club's name, so the h1 says it to search engines and screen readers only. -->
			<header class="vision">
				<h1 class="headline"><span class="sr-only">{`${club.name}: `}</span>{#each vision.labelRuns as r, i (i)}{#if r.strong}<span class="hl">{r.t}</span>{:else}{r.t}{/if}{/each}</h1>
				<p class="vision-text">
					{#each vision.runs as r, i (i)}{#if r.strong}<strong>{r.t}</strong>{:else}{r.t}{/if}{#if r.cite}<sup class="vision-cite"><a href={vision.source.href} target="_blank" rel="noopener noreferrer" aria-label="Source: {vision.source.label} (opens in a new tab)">[1]</a></sup>{/if}{/each}
				</p>
			</header>

			<div class="mascot" aria-hidden="true">
				<div class="spot"></div>
				<Badge size="100%" wave mood="happy" class="mascot-badge" />
			</div>
		</div>

		<!-- community size -->
		<dl class="stats">
			{#each stats.items as s (s.label)}
				<!-- dt first for screen readers; the number sits on top visually -->
				<div class="stat">
					<dt>{s.label}</dt>
					<dd>{#if s.approx}<span aria-hidden="true">~</span><span class="sr-only">nearly </span>{/if}{s.n}</dd>
				</div>
			{/each}
		</dl>

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

	.hero-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(0, 0.75fr);
		gap: clamp(2rem, 4vw, 3.5rem);
		align-items: center;
	}

	.vision { animation: rise 650ms var(--ease-out-expo) backwards; }
	.headline {
		font-family: var(--font-display);
		font-size: clamp(2.9rem, 7.4vw, 6.4rem);
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.035em;
		text-wrap: balance;
		color: var(--fg);
		text-shadow: 0 0.04em 0.5em rgb(0 0 0 / 0.35);
	}
	.headline .hl { color: var(--accent); }
	.vision-text {
		margin-top: clamp(1.25rem, 2.6vw, 1.9rem);
		max-width: 40rem;
		font-family: var(--font-display);
		font-size: clamp(1.15rem, 1.75vw, 1.5rem);
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: -0.005em;
		color: var(--fg);
	}
	.vision-text strong { font-weight: 700; }
	.vision-cite { font-size: 0.5em; line-height: 0; margin-left: 0.1em; }
	.vision-cite a { color: var(--muted); }
	.vision-cite a:hover, .vision-cite a:focus-visible { color: var(--accent); }

	.mascot {
		position: relative;
		width: min(100%, 23rem);
		margin-inline: auto;
		padding: 8% 6% 4%;
		animation: pop 800ms var(--ease-spring) 120ms backwards;
	}
	.spot {
		position: absolute;
		inset: 10% 4% 2%;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 45%, #3a1a17, #231412 60%, transparent 72%);
	}
	.mascot :global(.mascot-badge) { position: relative; animation: bob 5s ease-in-out infinite; }

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		max-width: 46rem;
		margin-top: clamp(2.5rem, 5vw, 3.5rem);
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
		.hero-grid { grid-template-columns: minmax(0, 1fr); }
		.mascot { order: -1; width: min(70%, 17rem); padding-top: 4%; }
	}
	@media (max-width: 560px) {
		.stats { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; }
		.stat { flex-direction: row-reverse; align-items: baseline; justify-content: flex-end; gap: 0.75rem; padding: 0.85rem 1.1rem; }
		.stat dt { margin-top: 0; }
		.stat dd { font-size: 2rem; }
	}
	@media (prefers-reduced-motion: reduce) {
		.vision, .mascot, .mascot :global(.mascot-badge) { animation: none; }
	}
</style>
