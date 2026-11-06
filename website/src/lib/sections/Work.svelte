<script lang="ts">
	import HivemindOverview from '$lib/components/HivemindOverview.svelte';
	import SubteamOrbit from '$lib/components/SubteamOrbit.svelte';
	import { work } from '$lib/content';
</script>

<section id="work" class="scroll-mt-16 overflow-clip border-t pt-16 pb-24 md:pt-20 md:pb-32" style:border-color="var(--line)">
	<div class="shell">
		<HivemindOverview />
	<div class="mt-16" data-reveal>
		<p class="eyebrow">{work.goals.label}</p>
		<p class="mt-2 text-sm" style:color="var(--muted)">Semester targets for real time saved. We’ll validate these with users as we build.</p>
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
		<p class="eyebrow">{work.northstar.label}</p>
		<p class="mt-2 max-w-xl text-[0.95rem] leading-relaxed" style:color="var(--muted)">
			{work.northstar.lede}
		</p>
		<div class="mt-7 grid gap-px overflow-hidden rounded-lg border md:grid-cols-3"
			style:border-color="var(--line)" style:background="var(--line)" data-stagger>
			{#each work.northstar.items as n (n.k)}
				<div data-reveal class="p-6" style:background="var(--surface)">
					<p class="font-mono text-[0.6rem] uppercase tracking-[0.14em]" style:color="var(--accent)">{n.metric}</p>
					<p class="mt-2.5 text-[0.98rem] leading-snug">{n.body}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- subteams -->
	<div id="subteams" class="mt-20 scroll-mt-24" data-reveal>
		<p class="eyebrow">{work.subteams.label}</p>
		<h2 class="mt-3 text-[clamp(1.9rem,3.5vw,2.75rem)]">Find your part of the Hivemind.</h2>
		<p class="mt-2 max-w-xl text-[0.95rem] leading-relaxed" style:color="var(--muted)">
			{work.subteams.lede}
		</p>
		<div class="mt-6">
			<SubteamOrbit />
		</div>
	</div>
	</div>
</section>

<style>
	.timeline {
		position: relative;
		display: grid;
		gap: 2rem;
		margin-top: 1.6rem;
	}
	@media (min-width: 640px) {
		.timeline {
			grid-template-columns: 1fr 1fr;
			gap: 3rem;
		}
		/* The run between the two milestones, behind both. */
		.rail {
			position: absolute;
			top: 5px;
			left: 5px;
			right: 5px;
			height: 1px;
			background: linear-gradient(to right, var(--accent), rgb(var(--glow) / 0.25));
		}
	}
	.rail { display: none; }
	@media (min-width: 640px) { .rail { display: block; } }

	.goal { position: relative; padding-top: 1.6rem; }
	.pip {
		position: absolute;
		top: 0;
		left: 0;
		width: 11px;
		height: 11px;
		border-radius: 999px;
		background: var(--accent);
		box-shadow: 0 0 0 4px rgb(var(--glow) / 0.16);
	}
	.when {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.count {
		margin-top: 0.4rem;
		font-size: clamp(2.6rem, 6vw, 3.6rem);
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}
	.unit { margin-top: 0.5rem; font-size: 0.95rem; color: var(--fg); }
	.saving { margin-top: 0.25rem; font-size: 0.9rem; color: var(--muted); }
</style>
