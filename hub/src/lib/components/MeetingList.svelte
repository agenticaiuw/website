<script lang="ts">
	import { formatDate, formatTimeRange } from '$lib/dates';
	import { teamNames } from '$lib/meeting-teams';
	import type { MeetingRow } from '$lib/types';
	import Empty from './Empty.svelte';

	let { meetings, today }: { meetings: MeetingRow[]; today: string } = $props();
</script>

{#if !meetings.length}
	<Empty>Nothing yet.</Empty>
{:else}
	<ul class="meetings">
		{#each meetings as m (m.id)}
			{@const [day, date] = formatDate(m.date, today).split(', ')}
			<li>
				<a href="/meetings/{m.id}">
					<span class="m-date">
						<b>{date}</b>
						<small>{day}</small>
					</span>
					<span class="m-body">
						<span class="m-title">{m.title}</span>
						<span class="m-meta"
							>{m.kind === 'event' ? 'Club event' : teamNames(m)}{m.time ? ` · ${formatTimeRange(m.time, m.end_time)}` : ''}{m.location ? ` · ${m.location}` : ''}{m.host_name
								? ` · Host: ${m.host_name}`
								: ''}</span
						>
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}
