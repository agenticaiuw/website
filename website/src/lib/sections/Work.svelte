<script lang="ts">
	import TeamCards from '$lib/components/TeamCards.svelte';
	import { site } from '$lib/site';
	const { work } = site();
</script>

<!-- One slide: the teams, who heads each and what it's working on.
     The project itself is on /hive/. -->
<section id="work" class="slide work scroll-mt-16">
	<header id="subteams" class="shell head scroll-mt-24">
		<p class="eyebrow accent" data-reveal>{work.subteams.label}</p>
		<h1 class="slide-title" data-reveal>{work.subteams.heading}</h1>
		<p class="lede" data-reveal>{work.subteams.lede}</p>
	</header>
	<div class="shell gallery"><TeamCards /></div>
</section>

<style>
	.slide-title { margin-top: 0.3rem; max-width: 52rem; }
	.lede { margin-top: clamp(0.5rem, 1.6svh, 0.9rem); max-width: 44rem; font-size: clamp(1rem, min(1.4vw, 2.5svh), 1.2rem); line-height: 1.55; color: var(--muted); }
	.gallery { margin-top: clamp(0.9rem, 3svh, 2rem); }
</style>
