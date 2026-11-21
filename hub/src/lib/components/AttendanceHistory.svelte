<script lang="ts">
	import { scrollToEnd } from '$lib/actions.js';
	import { formatDate } from '$lib/dates';
	import { attendanceLabel, type AttendanceRow } from '$lib/meetings';
	import type { MeetingKind } from '$lib/types';

	let {
		roster,
		history,
		rows,
		expected,
		kind,
		started
	}: {
		roster: { id: number; name: string }[];
		history: { id: number; title: string; date: string }[];
		rows: AttendanceRow[];
		expected: { meeting_id: number; member_id: number }[];
		kind: MeetingKind;
		started: number[];
	} = $props();

	const byCell = $derived(new Map(rows.map((row) => [`${row.member_id}:${row.meeting_id}`, row])));
	const expectedCells = $derived(new Set(expected.map((row) => `${row.member_id}:${row.meeting_id}`)));
	const people = $derived(new Map(roster.map((member) => [member.id, member.name])));
	const begun = $derived(new Set(started));
</script>

{#if people.size}
	<details class="card attendance-history" use:scrollToEnd>
		<summary class="link-btn">Attendance history</summary>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table-scroll" tabindex={0} role="region" aria-label="Attendance history">
			<table class="attendance-sheet">
				<thead>
					<tr>
						<th scope="col">Member</th>
						{#each history as meeting (meeting.id)}
							<th scope="col"><a href="/meetings/{meeting.id}" title={meeting.title}>{formatDate(meeting.date)}</a></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each people as [memberId, name] (memberId)}
						<tr>
							<th scope="row">{name}</th>
							{#each history as meeting (meeting.id)}
								{@const key = `${memberId}:${meeting.id}`}
								{@const entry = byCell.get(key)}
								<td
									>{#if entry}<span class="pill att-{entry.status}">{attendanceLabel(entry.status, entry.self_report)}</span>{:else if begun.has(meeting.id) && (kind === 'event' || expectedCells.has(key))}Absent{:else}—{/if}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
{/if}
