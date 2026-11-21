<script lang="ts">
	import { goto } from '$app/navigation';
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatDate, formatTimeRange } from '$lib/dates';
	import { meetingTeams } from '$lib/meeting-teams';
	import type { MeetingListRow } from '$lib/meetings';
	import { canAssign } from '$lib/perm';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
	const today = $derived(data.today);
	// Shown as soon as a box is ticked, before the new list arrives.
	let teamCount = $derived(data.selectedTeams.length);

	// Filters apply as they change, without reloading the page. Without JavaScript there's a button.
	function filter(e: Event) {
		const form = e.currentTarget as HTMLFormElement;
		teamCount = form.querySelectorAll('input[name="team"]:checked').length;
		const params = new URLSearchParams(new FormData(form) as unknown as Record<string, string>);
		if (!params.get('kind')) params.delete('kind');
		if (!params.get('date')) {
			params.delete('date');
			params.delete('date_mode');
		}
		goto(`/meetings${params.size ? `?${params}` : ''}`, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

{#snippet attendance(m: MeetingListRow)}
	{#if !m.marked}<span class="muted">Not taken</span>{:else}{m.kind === 'event' ? `${m.present} came` : `${m.present}/${m.marked} present`}{/if}
{/snippet}

<!-- Upcoming rows say where; past rows say who came and what came of it. -->
{#snippet table(rows: MeetingListRow[], ahead: boolean)}
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Date</th>
					<th>Meeting</th>
					<th>Team</th>
					{#if ahead}
						<th>Where</th>
					{:else}
						<th>Attendance</th>
						<th>Action items</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each rows as m (m.id)}
					<tr>
						<td class="nowrap">
							{formatDate(m.date, today)}
							{#if m.time}<small class="muted">{' '}{formatTimeRange(m.time, m.end_time)}</small>{/if}
						</td>
						<td>
							<a href="/meetings/{m.id}">{m.title}</a>
							{#if m.kind === 'event'}<span class="tag event">Club event</span>{/if}
						</td>
						<td class="team-tags">
							{#each meetingTeams(m) as t}<span class="tag {t.kind}">{t.name}</span>{/each}
						</td>
						{#if ahead}
							<td class="clip">{#if m.location}{m.location}{:else}<span class="muted">—</span>{/if}</td>
						{:else}
							<td>{@render attendance(m)}</td>
							<td>{#if m.actions}{m.actions - m.open_actions}/{m.actions} done{:else}<span class="muted">None</span>{/if}</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<PageHead title="Meetings" sub="Team meetings and club events: who came, what was discussed, and what everyone agreed to do.">
	{#snippet actions()}
		{#if canAssign(v)}
			<a class="btn" href="/meetings/new?kind=event">New event</a>
			<a class="btn primary" href="/meetings/new">New meeting</a>
		{/if}
	{/snippet}
</PageHead>
<div class="toolbar">
	<form method="get" action="/meetings" class="meeting-team-filter" onchange={filter} onsubmit={(e) => e.preventDefault()}>
		<div class="seg" aria-label="Meeting type">
			<label><input type="radio" name="kind" value="" checked={!data.events} /><span>All</span></label>
			<label><input type="radio" name="kind" value="event" checked={data.events} /><span>Club events</span></label>
		</div>
		<details class="menu team-filter-menu">
			<summary class="btn">{teamCount ? `Teams (${teamCount})` : 'All teams'} ▾</summary>
			<div class="menu-panel team-filter-panel" aria-label="Filter by teams">
				{#each data.teams as t (t.id)}
					<label class="check"><input type="checkbox" name="team" value={String(t.id)} checked={data.selectedTeams.includes(t.id)} /><span>{t.name}</span></label>
				{/each}
			</div>
		</details>
		<label class="sr-only" for="meeting-date-mode">Date comparison</label>
		<select id="meeting-date-mode" name="date_mode" aria-label="Date comparison">
			<option value="before" selected={data.dateMode === 'before'}>Before</option><option value="after" selected={data.dateMode === 'after'}>After</option><option value="on" selected={data.dateMode === 'on'}>On</option>
		</select>
		<input type="date" name="date" value={data.date} aria-label="Meeting date" />
		<noscript><button class="btn small">Apply filters</button></noscript>
	</form>
</div>
<div id="meeting-filter-results" aria-live="polite">
	<h2 class="section-title">Upcoming</h2>
	{#if data.soon.length}{@render table(data.soon, true)}{:else}<Empty>{data.later.length ? 'Nothing in the next three weeks.' : 'Nothing scheduled.'}</Empty>{/if}
	{#if data.later.length > 0}
		<details class="more">
			<summary>{data.later.length} more after {formatDate(data.cutoff, today)}</summary>
			{@render table(data.later, true)}
		</details>
	{/if}
	<h2 class="section-title">Past</h2>
	{#if data.past.length}{@render table(data.past, false)}{:else}<Empty>None yet.</Empty>{/if}
</div>
