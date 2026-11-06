<script lang="ts">
	import Events from '$lib/sections/Events.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { club } from '$lib/content';
</script>

<Meta title="Events · {club.name}" description="Meetings, workshops, speaker events and socials from {club.name}, the agentic AI student club at the {club.university}." />

<div class="pt-16">
	<Events />
	<PageNav />
</div>
