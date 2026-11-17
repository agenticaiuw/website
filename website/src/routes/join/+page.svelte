<script lang="ts">
	import Join from '$lib/sections/Join.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';

	const { pages } = site();
</script>

<Meta title={pages.join.title} description={pages.join.description} />

<div>
	<Join />
	<PageNav />
</div>
