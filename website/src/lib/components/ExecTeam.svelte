<script lang="ts">
	import TeamGrid from './TeamGrid.svelte';
	import { site } from '$lib/site';
	const { team } = site();
</script>

<!-- Home page, last slide: the people behind the club, in a gallery that scrolls sideways. -->
<section id="team" class="slide board scroll-mt-20" aria-labelledby="team-heading">
	<div class="shell">
		<h2 id="team-heading" class="slide-title" data-reveal>{team.heading}</h2>
	</div>
	<div class="gallery"><TeamGrid /></div>
</section>

<style>
	.gallery { margin-top: clamp(1.25rem, 4svh, 2.5rem); }
</style>
