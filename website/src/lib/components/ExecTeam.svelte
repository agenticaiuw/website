<script lang="ts">
	import TeamGrid from './TeamGrid.svelte';
	import { site } from '$lib/site';
	const { team } = site();
</script>

<!-- Home page, second block: the people behind the club. -->
<section id="team" class="board scroll-mt-20" aria-labelledby="team-heading">
	<div class="shell">
		<h2 id="team-heading" data-reveal>{team.heading}</h2>
		<div class="grid-wrap"><TeamGrid /></div>
	</div>
</section>

<style>
	.board { padding: 0 0 clamp(4.5rem, 9vw, 7rem); }
	h2 { margin-top: 0.4rem; font-size: clamp(2rem, 4.4vw, 3.1rem); }
	.grid-wrap { margin-top: clamp(2rem, 4vw, 2.75rem); }
</style>
