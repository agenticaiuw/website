<script lang="ts">
	import TeamPage from '$lib/components/TeamPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<TeamPage {data} />
