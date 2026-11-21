<script lang="ts">
	import MeetingForm from '$lib/components/MeetingForm.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const m = $derived(data.m);
</script>

<PageHead eyebrow={m.kind === 'event' ? 'Edit club event' : 'Edit meeting'} title={m.title} />
<MeetingForm
	v={data.viewer}
	teamList={data.teamList}
	people={data.people}
	picked={data.picked}
	teamsOf={data.teamsOf}
	{m}
	kind={m.kind}
	action="/meetings/{m.id}"
	today={data.today}
	later={data.later}
	every={data.every}
	last={data.last}
/>
