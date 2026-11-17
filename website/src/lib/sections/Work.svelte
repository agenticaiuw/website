<script lang="ts">
	import HivemindOverview from '$lib/components/HivemindOverview.svelte';
	import SubteamOrbit from '$lib/components/SubteamOrbit.svelte';
	import { site } from '$lib/site';
	const { work } = site();
</script>

<section id="work" class="work scroll-mt-16 overflow-clip">
	<div class="shell">
		<HivemindOverview />
	<div class="mt-20" data-reveal>
		<h2 class="block-title">{work.goals.label}</h2>
		<p class="block-lede">{work.goals.lede}</p>
		<div class="timeline">
			<span class="rail" aria-hidden="true"></span>
			{#each work.goals.items as g (g.when)}
				<div class="goal">
					<span class="pip" aria-hidden="true"></span>
					<p class="when">{g.when}</p>
					<p class="count">{g.people}</p>
					<p class="unit">{g.unit}</p>
					<p class="saving">{g.saving}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- northstar -->
	<div class="mt-12" data-reveal>
		<h2 class="block-title">{work.goals.northstarLabel}</h2>
		<p class="block-lede">{work.goals.northstarLede}</p>
		<div class="north-grid" data-stagger>
			{#each work.goals.northstar as n, i (n.metric)}
				<div data-reveal class="card north">
					<span class="tag-pill {['red', 'blue', 'gold'][i % 3]}">{n.metric}</span>
					<p>{n.body}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- subteams -->
	<div id="subteams" class="mt-20 scroll-mt-24" data-reveal>
		<p class="eyebrow accent">{work.subteams.label}</p>
		<h2 class="teams-title">{work.subteams.heading}</h2>
		<p class="block-lede">{work.subteams.lede}</p>
		<div class="mt-6">
			<SubteamOrbit />
		</div>
	</div>
	</div>
</section>

<style>
	.work { padding: clamp(6.5rem, 11vw, 8.5rem) 0 clamp(4.5rem, 9vw, 7rem); }
	.block-title { font-size: clamp(1.6rem, 3vw, 2.1rem); }
	.block-lede { margin-top: 0.5rem; max-width: 40rem; font-size: 1rem; line-height: 1.6; color: var(--muted); }
	.teams-title { margin-top: 0.4rem; font-size: clamp(2rem, 4vw, 2.9rem); }

	.timeline {
		position: relative;
		display: grid;
		gap: 0.85rem;
		margin-top: 1.5rem;
	}
	@media (min-width: 640px) {
		.timeline { grid-template-columns: 1fr 1fr; }
	}
	.rail { display: none; }

	.goal {
		position: relative;
		padding: 1.5rem 1.6rem 1.6rem;
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--shadow);
	}
	.goal:last-child { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 75%); border-color: var(--accent-border); }
	.pip { display: none; }
	.when {
		display: inline-flex;
		padding: 0.2rem 0.75rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1.5px solid var(--line-strong);
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.35;
		color: var(--fg);
	}
	.count {
		margin-top: 0.75rem;
		font-family: var(--font-display);
		font-size: clamp(3rem, 7vw, 4.25rem);
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}
	.unit { margin-top: 0.35rem; font-family: var(--font-display); font-size: 1.2rem; font-weight: 600; color: var(--fg); }
	.saving { margin-top: 0.3rem; font-size: 0.95rem; line-height: 1.5; color: var(--muted); }

	.north-grid { display: grid; gap: 0.85rem; margin-top: 1.5rem; }
	@media (min-width: 768px) { .north-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.north { display: flex; flex-direction: column; align-items: flex-start; gap: 0.85rem; padding: 1.5rem; }
	.north p { font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
</style>
