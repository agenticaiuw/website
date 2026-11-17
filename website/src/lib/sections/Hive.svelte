<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import { richHtml, site } from '$lib/site';
	const { project, work } = site();
</script>

<section id="hive" class="hive-page scroll-mt-16 overflow-clip">
	<div class="shell">
		<!-- Hive: the project goal, why it matters, then this semester's plan. -->
		<header class="hive" data-reveal>
			<p class="eyebrow accent">{project.eyebrow}</p>
			<h1>{project.title}<span class="title-dot">.</span></h1>
			<p class="goal">{@html richHtml(project.goal)}</p>
			{#if project.why}<p class="why">{project.why}</p>{/if}
		</header>

		<div class="semester card" data-reveal>
			<h2>{project.semesterLabel}</h2>
			<ol>
				{#each project.semester as point, i (i)}
					<li><span class="index-numeral" aria-hidden="true">{i + 1}</span><p>{point}</p></li>
				{/each}
			</ol>
			<a class="repo" href={project.repoHref} target="_blank" rel="noopener noreferrer">
				{project.repoCta} <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>
			</a>
		</div>

		<!-- Who builds it: one link per team page. -->
		<nav class="builders" aria-labelledby="builders-heading" data-reveal>
			<h2 id="builders-heading"><a href="/teams/">{work.subteams.heading} <span class="go" aria-hidden="true">→</span></a></h2>
			<ul role="list">
				{#each work.subteams.items as t (t.k)}
					<li>
						<a href="/teams/{t.k}/" class="chip">
							<Badge size={30} prop={t.k} sticker={false} />
							<span>{t.short}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</section>

<style>
	.hive-page { padding: clamp(6.5rem, 11vw, 8.5rem) 0 clamp(4.5rem, 9vw, 7rem); }
	.hive { max-width: 56rem; }
	h1 { margin: 0.4rem 0 1rem; font-size: clamp(3.6rem, 8vw, 6.2rem); font-weight: 800; line-height: 1.02; letter-spacing: -0.035em; }
	.title-dot { color: var(--accent); }
	.goal {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 2.6vw, 2rem);
		font-weight: 500;
		line-height: 1.3;
		letter-spacing: -0.01em;
		color: var(--muted);
	}
	.goal :global(strong) { font-weight: 700; color: var(--fg); }
	.why { margin-top: 1.25rem; max-width: 44rem; font-size: 1.05rem; line-height: 1.65; color: var(--muted); }

	.semester { margin-top: clamp(2rem, 4vw, 2.75rem); padding: clamp(1.4rem, 3vw, 2rem); background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.semester h2 { font-size: clamp(1.4rem, 2.6vw, 1.8rem); }
	.semester ol { display: grid; gap: 1rem; margin-top: 1.25rem; list-style: none; padding: 0; }
	@media (min-width: 900px) { .semester ol { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.semester li { display: flex; align-items: flex-start; gap: 0.85rem; min-width: 0; }
	.semester li .index-numeral { flex: none; width: 2.2rem; height: 2.2rem; font-size: 0.95rem; }
	.semester li p { min-width: 0; font-size: 1rem; line-height: 1.55; color: var(--fg); }
	.repo { display: inline-block; margin-top: 1.4rem; font-family: var(--font-display); font-weight: 700; color: var(--accent); }
	.repo:hover, .repo:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

	.builders { margin-top: clamp(2.5rem, 5vw, 3.5rem); }
	.builders h2 { font-size: clamp(1.4rem, 2.6vw, 1.8rem); }
	.builders h2 a { color: var(--fg); }
	.builders h2 a:hover, .builders h2 a:focus-visible { color: var(--accent); }
	.builders .go { display: inline-block; color: var(--accent); transition: transform 0.2s ease; }
	.builders h2 a:hover .go, .builders h2 a:focus-visible .go { transform: translateX(3px); }
	.builders ul { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; list-style: none; padding: 0; }
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.85rem 0.3rem 0.4rem;
		border-radius: 999px;
		border: 1.5px solid var(--line-strong);
		background: var(--surface);
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--fg);
		transition: border-color 0.2s ease;
	}
	.chip:hover, .chip:focus-visible { border-color: var(--accent); }
	@media (prefers-reduced-motion: reduce) { .builders .go { transition: none; } }
</style>
