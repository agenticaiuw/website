<script lang="ts">
	import Partners from '$lib/sections/Partners.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';

	const { pages } = site();
</script>

<Meta title={pages.partners.title} description={pages.partners.description} />

<div>
	<Partners />
	<PageNav />
</div>
