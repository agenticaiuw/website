<script lang="ts">
	import Events from '$lib/sections/Events.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';

	const { pages } = site();
</script>

<Meta title={pages.events.title} />

<div>
	<Events />
	<PageNav />
</div>
