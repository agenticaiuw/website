<script lang="ts">
	import Work from '$lib/sections/Work.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';

	const { pages } = site();
</script>

<Meta title={pages.teams.title} description={pages.teams.description} />

<div>
	<Work />
	<PageNav />
</div>
