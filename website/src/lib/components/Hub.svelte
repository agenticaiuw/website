<script lang="ts">
	import AgentGraph from './AgentGraph.svelte';
	import PressFeature from './PressFeature.svelte';
	import Reasons from './Reasons.svelte';
	import ExecTeam from './ExecTeam.svelte';
	import Badge from './Badge.svelte';
	import { site } from '$lib/site';
	const { club, vision, stats } = site();
	/* The headline's runs cut into words, so each word can come up on its own. */
	const words = (t: string) => t.split(/(\s+)/);
</script>

<!-- The home page is a run of full-screen slides, one idea to a screen. -->

<section class="slide hero">
	<div class="graph" aria-hidden="true"><AgentGraph /></div>
	<div class="fade" aria-hidden="true"></div>

	<!-- The nav bar already shows the club's name, so the h1 says it to search engines and screen readers only. -->
	<header class="shell hero-inner" data-hero>
		<h1 class="headline"><span class="sr-only">{`${club.name}: `}</span>{#each vision.labelRuns as r, i (i)}{#each words(r.t) as w, j (j)}{#if w.trim()}<span class="word" class:hl={r.strong} data-word>{w}</span>{:else}{w}{/if}{/each}{/each}</h1>
		<p class="vision-text" data-hero-after>
			{#each vision.runs as r, i (i)}{#if r.strong}<strong>{r.t}</strong>{:else}{r.t}{/if}{#if r.cite}<sup class="vision-cite"><a href={vision.source.href} target="_blank" rel="noopener noreferrer" aria-label="Source: {vision.source.label} (opens in a new tab)">[1]</a></sup>{/if}{/each}
		</p>
	</header>

	<div class="cue" aria-hidden="true" data-cue>
		<span data-hero-after>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
		</span>
	</div>
</section>

<!-- How big the community is, and the paper that wrote about it, with the mascot on the clipping. -->
<section class="slide community">
	<div class="shell community-inner">
		<dl class="stats" data-stagger>
			{#each stats.items as s (s.label)}
				<!-- dt first for screen readers; the number sits first visually -->
				<div class="stat" data-reveal>
					<dt>{s.label}</dt>
					<dd>{#if s.approx}<span class="approx" aria-hidden="true">~</span><span class="sr-only">nearly </span>{/if}<span data-count={s.n}>{s.n}</span></dd>
				</div>
			{/each}
		</dl>
		<div class="press" data-zoom>
			<div class="mascot" aria-hidden="true" data-pop>
				<Badge size="100%" wave mood="happy" class="mascot-badge" />
			</div>
			<PressFeature />
		</div>
	</div>
</section>

<Reasons />

<ExecTeam />

<style>
	.hero {
		isolation: isolate;
		overflow: clip;
		text-align: center;
	}
	.graph { position: absolute; inset: 0; z-index: -2; opacity: 0.55; }
	.fade {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background:
			radial-gradient(60% 55% at 50% 45%, rgb(var(--glow) / 0.1), transparent 70%),
			radial-gradient(120% 85% at 50% 45%, transparent 0%, color-mix(in oklab, var(--bg) 70%, transparent) 55%, var(--bg) 100%);
	}

	.hero-inner { display: flex; flex-direction: column; align-items: center; transform-origin: 50% 40%; }
	/* Square-cut capitals: this line is the club's claim. It is sized to the
	   screen's width and its height, so it never runs off either edge. */
	.headline {
		font-family: var(--font-sans);
		font-size: clamp(2.1rem, min(11.5vw, 13svh), 8.5rem);
		font-weight: 900;
		line-height: 0.92;
		letter-spacing: -0.04em;
		text-transform: uppercase;
		text-wrap: balance;
		color: var(--fg);
		text-shadow: 0 0.04em 0.5em rgb(0 0 0 / 0.35);
	}
	.word { display: inline-block; }
	.word.hl { color: var(--accent); }
	.vision-text {
		margin-top: clamp(1.25rem, 4svh, 2.5rem);
		max-width: 44rem;
		font-family: var(--font-sans);
		font-size: clamp(1.1rem, min(1.7vw, 2.9svh), 1.5rem);
		font-weight: 500;
		line-height: 1.45;
		color: var(--fg);
	}
	.vision-text strong { font-weight: 800; }
	.vision-cite { font-size: 0.5em; line-height: 0; margin-left: 0.1em; }
	.vision-cite a { color: var(--muted); }
	.vision-cite a:hover, .vision-cite a:focus-visible { color: var(--accent); }

	.cue {
		position: absolute;
		inset-inline: 0;
		bottom: clamp(0.75rem, 4svh, 2rem);
		width: fit-content;
		margin-inline: auto;
		color: var(--muted);
	}
	.cue span { display: block; animation: nudge 2.4s ease-in-out infinite; }

	/* ---- community: numbers beside the press clipping ---- */
	.community-inner {
		--m: clamp(4.5rem, min(17svh, 30vw), 9.5rem); /* mascot size */
		display: grid;
		grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
		align-items: center;
		gap: clamp(2rem, 4.5vw, 4.5rem);
	}
	/* number and label in two columns shared by every row, so the labels line up */
	.stats { display: grid; grid-template-columns: auto minmax(0, 1fr); }
	.stat {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: baseline;
		column-gap: clamp(0.9rem, 2vw, 1.5rem);
		padding-block: clamp(0.5rem, 2.7svh, 1.5rem);
		border-top: 1px solid var(--line-strong);
	}
	.stat:last-child { border-bottom: 1px solid var(--line-strong); }
	.stat dd {
		grid-column: 1;
		grid-row: 1;
		justify-self: end;
		font-family: var(--font-sans);
		font-size: clamp(2.6rem, min(7.2vw, 13.5svh), 7.25rem);
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.045em;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
		white-space: nowrap;
	}
	.stat dt {
		grid-column: 2;
		grid-row: 1;
		font-size: clamp(1rem, min(1.6vw, 2.8svh), 1.4rem);
		font-weight: 600;
		line-height: 1.3;
		color: var(--muted);
	}
	.approx { margin-right: 0.04em; color: var(--muted); font-weight: 700; }

	.press { position: relative; display: grid; justify-items: center; }
	/* the mascot perches on the clipping's top corner */
	.mascot {
		position: absolute;
		z-index: 1;
		top: calc(var(--m) * -0.58);
		right: clamp(-1rem, -1vw, -0.25rem);
		width: var(--m);
	}
	.mascot :global(.mascot-badge) { position: relative; animation: bob 5s ease-in-out infinite; }

	@keyframes bob {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-8px); }
	}
	@keyframes nudge {
		0%, 100% { transform: translateY(0); opacity: 0.6; }
		50% { transform: translateY(6px); opacity: 1; }
	}

	@media (max-width: 899px) {
		/* stacked: leave room above the clipping for the mascot */
		.community-inner { grid-template-columns: minmax(0, 1fr); gap: calc(var(--m) * 0.58 + 1rem); }
		.stats { width: 100%; max-width: 34rem; justify-self: center; }
		.stat { padding-block: clamp(0.4rem, 1.7svh, 1rem); }
		.stat dd { font-size: clamp(2.6rem, min(13vw, 7svh), 4.5rem); }
	}
	@media (max-width: 480px) {
		/* narrow phones: the mascot sits higher so it clears the clipping's top line */
		.community-inner { gap: calc(var(--m) * 0.74 + 0.75rem); }
		.mascot { top: calc(var(--m) * -0.74); }
	}
	@media (prefers-reduced-motion: reduce) {
		.cue span, .mascot :global(.mascot-badge) { animation: none; }
	}
</style>
