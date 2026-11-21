<script lang="ts">
	import BoardTaskForm from '$lib/components/BoardTaskForm.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PageHead title="New team task">
	{#snippet sub()}<a href="/teams/{data.team.id}">{data.team.name}</a>{/snippet}
</PageHead>
<BoardTaskForm action="/teams/{data.team.id}/board" due={data.due} members={data.members} subteams={data.subteams} assignedPeople={data.assignedPeople} assignedSubteams={data.assignedSubteams} />
