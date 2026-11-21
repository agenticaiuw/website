<script lang="ts">
	import SiteHistory from '$lib/components/SiteHistory.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SiteHistory section={data.section} entries={data.entries} more={data.more} before={data.before} base={data.base} zone={data.zone} />
