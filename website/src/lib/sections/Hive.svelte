<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import { richHtml, site } from '$lib/site';
	const { project, work } = site();
	// What people download: GitHub builds each one from the repo's main branch on every push.
	const builds = 'https://github.com/agenticaiuw/hive/releases/download/latest/';
	const downloads = [
		{ name: 'Mac', note: 'Apple silicon and Intel', file: 'Hive-Mac.zip' },
		{ name: 'Windows', note: 'Windows 10 and 11', file: 'hive-windows.exe' },
		{ name: 'Browser', note: 'Chrome, Edge and Brave: load the unzipped folder in Extensions with Developer mode on', file: 'Hive-Browser.zip' }
	];
</script>

<!-- Slide 1: the project's name and goal, big, with why it matters. -->
<section id="hive" class="slide hive-hero scroll-mt-16">
	<header class="shell hero-inner" data-hero>
		<p class="eyebrow accent" data-hero-after>{project.eyebrow}</p>
		<h1 class="title"><span class="word" data-word>{project.title}<span class="title-dot">.</span></span></h1>
		<p class="goal" data-hero-after>{@html richHtml(project.goal)}</p>
		{#if project.why}<p class="why" data-hero-after>{project.why}</p>{/if}
	</header>

	<div class="cue" aria-hidden="true" data-cue>
		<span data-hero-after>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
		</span>
	</div>
</section>

<!-- Slide 2: this semester's plan, the code, and the teams building it. -->
<section class="slide hive-plan" aria-labelledby="plan-heading">
	<div class="shell">
		<h2 id="plan-heading" class="slide-title" data-reveal>{project.semesterLabel}</h2>
		<ol class="points" role="list" data-stagger>
			{#each project.semester as point, i (i)}
				<li class="card point" data-reveal>
					<span class="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
					<p>{point}</p>
				</li>
			{/each}
		</ol>
		<a class="repo" href={project.repoHref} target="_blank" rel="noopener noreferrer" data-reveal>
			{project.repoCta} <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>
		</a>

		<!-- Who builds it: one link per team page. -->
		<nav class="builders" aria-labelledby="builders-heading">
			<h2 id="builders-heading" data-reveal><a href="/teams/">{work.subteams.heading} <span class="go" aria-hidden="true">→</span></a></h2>
			<ul class="tiles" role="list" data-stagger>
				{#each work.subteams.items as t (t.k)}
					<li data-reveal>
						<a href="/teams/{t.k}/" class="tile">
							<span class="ring"><Badge size="100%" prop={t.k} sticker={false} /></span>
							<span class="tile-name">{t.short}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</section>

<!-- Slide 3: download Hive for each device. -->
<section id="download" class="slide hive-get scroll-mt-16" aria-labelledby="get-heading">
	<div class="shell">
		<h2 id="get-heading" class="slide-title" data-reveal>Download Hive</h2>
		<p class="get-lede" data-reveal>Each one connects to a Hive with the code from its dashboard's Pair a device.</p>
		<ul class="gets" role="list" data-stagger>
			{#each downloads as d (d.file)}
				<li data-reveal>
					<a class="card get" href={builds + d.file} download>
						<span class="get-name">{d.name}</span>
						<span class="get-note">{d.note}</span>
						<span class="get-file">{d.file} <span aria-hidden="true">↓</span></span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</section>

<style>
	/* ---- slide 3 ---- */
	.get-lede { margin-top: clamp(0.6rem, 1.8svh, 1rem); max-width: 46rem; font-size: clamp(1rem, min(1.25vw, 2.3svh), 1.15rem); line-height: 1.6; color: var(--muted); }
	.gets { display: grid; gap: clamp(0.75rem, 1.6svh, 1rem); margin-top: clamp(1.1rem, 3.5svh, 2.25rem); list-style: none; padding: 0; }
	@media (min-width: 700px) { .gets { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.get { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; padding: clamp(1.1rem, min(2vw, 3.2svh), 1.75rem); transition: border-color 0.2s ease; }
	.get:hover, .get:focus-visible { border-color: var(--accent); }
	.get-name { font-family: var(--font-sans); font-size: clamp(1.6rem, min(2.8vw, 5svh), 2.4rem); font-weight: 900; letter-spacing: -0.04em; color: var(--fg); }
	.get-note { flex: 1; font-size: 1rem; line-height: 1.5; color: var(--muted); }
	.get-file { font-family: var(--font-sans); font-weight: 700; color: var(--accent); }

	/* ---- slide 1 ---- */
	.hive-hero { overflow: clip; }
	.hero-inner { transform-origin: 30% 40%; }
	.title {
		margin-top: 0.25rem;
		font-family: var(--font-sans);
		font-size: clamp(4.5rem, min(21vw, 24svh), 13rem);
		font-weight: 900;
		line-height: 0.88;
		letter-spacing: -0.05em;
		text-transform: uppercase;
		color: var(--fg);
	}
	.word { display: inline-block; }
	.title-dot { color: var(--accent); }
	.goal {
		margin-top: clamp(1rem, 3.5svh, 2rem);
		max-width: 58rem;
		font-family: var(--font-sans);
		font-size: clamp(1.3rem, min(2.5vw, 4.2svh), 2.1rem);
		font-weight: 500;
		line-height: 1.3;
		letter-spacing: -0.015em;
		color: var(--fg);
	}
	.goal :global(strong) { font-weight: 800; }
	.why {
		margin-top: clamp(0.9rem, 2.6svh, 1.5rem);
		max-width: 46rem;
		font-size: clamp(1rem, min(1.25vw, 2.3svh), 1.15rem);
		line-height: 1.6;
		color: var(--muted);
	}
	.cue {
		position: absolute;
		inset-inline: 0;
		bottom: clamp(0.75rem, 4svh, 2rem);
		width: fit-content;
		margin-inline: auto;
		color: var(--muted);
	}
	.cue span { display: block; animation: nudge 2.4s ease-in-out infinite; }
	@keyframes nudge {
		0%, 100% { transform: translateY(0); opacity: 0.6; }
		50% { transform: translateY(6px); opacity: 1; }
	}

	/* ---- slide 2 ---- */
	.points {
		display: grid;
		gap: clamp(0.75rem, 1.6svh, 1rem);
		margin-top: clamp(1.1rem, 3.5svh, 2.25rem);
		list-style: none;
		padding: 0;
	}
	@media (min-width: 700px) { .points { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.point {
		display: flex;
		flex-direction: column;
		gap: clamp(0.5rem, 1.6svh, 1rem);
		min-width: 0;
		padding: clamp(1.1rem, min(2vw, 3.2svh), 1.75rem);
	}
	.point:first-child { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.num {
		font-family: var(--font-sans);
		font-size: clamp(1.9rem, min(3.4vw, 6svh), 3.1rem);
		font-weight: 900;
		line-height: 0.85;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
		color: var(--accent);
	}
	.point p { font-size: clamp(1rem, min(1.4vw, 2.5svh), 1.25rem); line-height: 1.5; color: var(--fg); }
	.repo { display: inline-block; margin-top: clamp(0.9rem, 2.4svh, 1.4rem); font-family: var(--font-sans); font-size: 1.05rem; font-weight: 700; color: var(--accent); }
	.repo:hover, .repo:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

	.builders { margin-top: clamp(1.5rem, 5svh, 3.25rem); padding-top: clamp(1.1rem, 3.5svh, 2rem); border-top: 1px solid var(--line-strong); }
	.builders h2 { font-family: var(--font-sans); font-size: clamp(1.3rem, min(2.2vw, 4svh), 1.9rem); font-weight: 800; letter-spacing: -0.02em; }
	.builders h2 a { color: var(--fg); }
	.builders h2 a:hover, .builders h2 a:focus-visible { color: var(--accent); }
	.go { display: inline-block; color: var(--accent); transition: transform 0.2s ease; }
	.builders h2 a:hover .go, .builders h2 a:focus-visible .go { transform: translateX(3px); }
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: clamp(0.5rem, 1.4vw, 1rem);
		margin-top: clamp(0.9rem, 2.6svh, 1.4rem);
		list-style: none;
		padding: 0;
	}
	@media (min-width: 900px) { .tiles { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
	/* narrow phones: two to a row so every team name fits on one line */
	@media (max-width: 370px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
		height: 100%;
		padding: clamp(0.7rem, 2svh, 1.1rem) 0.5rem;
		border-radius: var(--r-lg);
		border: 1px solid var(--line);
		background: var(--surface);
		text-align: center;
		transition: border-color 0.2s ease;
	}
	.tile:hover, .tile:focus-visible { border-color: var(--accent); }
	.ring {
		display: grid;
		place-items: center;
		width: clamp(3.25rem, min(7vw, 9svh), 5.25rem);
		aspect-ratio: 1;
		padding: 0.35rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1.5px solid var(--line-strong);
	}
	.tile-name { font-family: var(--font-sans); font-size: clamp(0.95rem, 1.3vw, 1.1rem); font-weight: 700; line-height: 1.2; color: var(--fg); overflow-wrap: break-word; }

	@media (prefers-reduced-motion: reduce) {
		.cue span { animation: none; }
		.go { transition: none; }
	}
</style>
