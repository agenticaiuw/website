<script lang="ts">
	import TeamCards from '$lib/components/TeamCards.svelte';
	import { richHtml, site } from '$lib/site';
	const { project, work } = site();
</script>

<section id="work" class="work scroll-mt-16 overflow-clip">
	<div class="shell">
		<!-- Hive: the goal from the Nov 8 alignment meeting, then this semester's plan. -->
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

		<!-- subteams -->
		<div id="subteams" class="mt-20 scroll-mt-24" data-reveal>
			<p class="eyebrow accent">{work.subteams.label}</p>
			<h2 class="teams-title">{work.subteams.heading}</h2>
			<p class="block-lede">{work.subteams.lede}</p>
			<div class="mt-6">
				<TeamCards />
			</div>
		</div>
	</div>
</section>

<style>
	.work { padding: clamp(6.5rem, 11vw, 8.5rem) 0 clamp(4.5rem, 9vw, 7rem); }
	.block-lede { margin-top: 0.5rem; max-width: 40rem; font-size: 1rem; line-height: 1.6; color: var(--muted); }
	.teams-title { margin-top: 0.4rem; font-size: clamp(2rem, 4vw, 2.9rem); }

	/* ---------- Hive ---------- */
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

</style>
