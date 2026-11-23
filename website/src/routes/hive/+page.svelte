<script lang="ts">
	import Hive from '$lib/sections/Hive.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';

	const { pages } = site();
</script>

<Meta title={pages.hive.title} />

<div>
	<Hive />
	<PageNav />
</div>
