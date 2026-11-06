<script lang="ts">
	import Join from '$lib/sections/Join.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { club } from '$lib/content';
</script>

<Meta title="How to join · {club.name}" description="Join {club.name} at UW–Madison any time of year: book office hours with the lead of the team you want to join. No application, no cutoff." />

<div class="pt-16">
	<Join />
	<PageNav />
</div>
