<script lang="ts">
	import TeamCards from '$lib/components/TeamCards.svelte';
	import { site } from '$lib/site';
	const { work } = site();
</script>

<section id="work" class="work scroll-mt-16 overflow-clip">
	<div class="shell">
		<!-- The teams: who heads each one and what it's working on. The project itself is on /hive/. -->
		<header id="subteams" class="scroll-mt-24" data-reveal>
			<p class="eyebrow accent">{work.subteams.label}</p>
			<h1>{work.subteams.heading}</h1>
			<p class="lede">{work.subteams.lede}</p>
		</header>
		<div class="mt-8">
			<TeamCards />
		</div>
	</div>
</section>

<style>
	.work { padding: clamp(6.5rem, 11vw, 8.5rem) 0 clamp(4.5rem, 9vw, 7rem); }
	h1 { margin-top: 0.4rem; max-width: 52rem; font-size: clamp(2.6rem, 6vw, 4.4rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.03em; }
	.lede { margin-top: 0.9rem; max-width: 42rem; font-size: 1.1rem; line-height: 1.6; color: var(--muted); }
</style>
