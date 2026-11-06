<script lang="ts">
	import Work from '$lib/sections/Work.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { club } from '$lib/content';
</script>

<Meta title="Teams · {club.name}" description="Seven teams building Hivemind, an open source AI assistant, at {club.university}: Hardware, Cloud, PC, Browser, Research, Design / Product and Business. No prior AI experience required." />

<div class="pt-16">
	<Work />
	<PageNav />
</div>
