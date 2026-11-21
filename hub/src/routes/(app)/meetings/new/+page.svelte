<script lang="ts">
	import MeetingForm from '$lib/components/MeetingForm.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PageHead eyebrow="Meetings" title={data.title} sub="Set it up ahead of time or after it happens. Attendance and action items go on its page." />
<MeetingForm v={data.viewer} teamList={data.teamList} people={data.people} picked={data.picked} teamsOf={data.teamsOf} kind={data.kind} action="/meetings" today={data.today} />
