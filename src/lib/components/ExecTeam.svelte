<script lang="ts">
	import TeamGrid from './TeamGrid.svelte';
	import { team } from '$lib/content';
</script>

<!-- Home page, second block: the people behind the club. -->
<section id="team" class="scroll-mt-16 border-t py-20 md:py-28" style:border-color="var(--line)" aria-labelledby="team-heading">
	<div class="shell">
		<h2 id="team-heading" data-reveal class="max-w-3xl text-[clamp(1.9rem,4.4vw,3.1rem)]">{team.heading}</h2>
		<div class="mt-10 md:mt-12"><TeamGrid /></div>
	</div>
</section>
