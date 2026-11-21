<script lang="ts">
	import { opensDialog } from '$lib/actions.js';
	import BoardTaskList from '$lib/components/BoardTaskList.svelte';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import MeetingList from '$lib/components/MeetingList.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import { formatDate } from '$lib/dates';
	import { collapseTasks } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
	const today = $derived(data.today);
	const overdue = $derived(data.mine.filter((t) => t.due_date < today));
	const thisWeek = $derived(data.mine.filter((t) => t.due_date >= today && t.due_date <= data.weekOut));
	const later = $derived(data.mine.filter((t) => t.due_date > data.weekOut));
	const openCount = $derived(data.mine.length + data.shared.length);
	const overdueCount = $derived(overdue.length + data.shared.filter((t) => t.due_date < today).length);
	const waiting = $derived(collapseTasks(data.assignedByMe, v.id).length);
	const myRow = (team: number) => data.teamMembers.find((m) => m.team_id === team && m.member_id === v.id);
</script>

<PageHead
	eyebrow={formatDate(today)}
	title={`Hi, ${v.name.split(' ')[0]}`}
	sub={openCount ? `You have ${openCount} open task${openCount === 1 ? '' : 's'}${overdueCount ? `, ${overdueCount} overdue` : ''}.` : "You're all caught up."}
>
	{#snippet actions()}<a class="btn primary" href="/tasks/new">New task</a>{/snippet}
</PageHead>
{#if data.clubOverdue && data.clubOverdue.n > 0}
	{@const c = data.clubOverdue}
	<p class="callout">
		Across the club, <b>{c.n}</b> task{c.n === 1 ? ' is' : 's are'} overdue among <b>{c.people}</b>
		{c.people === 1 ? 'person' : 'people'}. <a href="/people">See who</a>
	</p>
{/if}

<div class="grid-2 wide-left">
	<section>
		{#if overdue.length > 0}
			<h2 class="section-title bad">Overdue <span class="count">{overdue.length}</span></h2>
			<TaskList tasks={overdue} {today} viewer={v} show={['team', 'meeting']} back="/" />
		{/if}
		<h2 class="section-title">
			Due in the next 7 days {#if thisWeek.length > 0}<span class="count">{thisWeek.length}</span>{/if}
		</h2>
		<TaskList tasks={thisWeek} {today} viewer={v} show={['team', 'meeting']} back="/" empty="Nothing due this week." />
		{#if later.length > 0}
			<h2 class="section-title">Later <span class="count">{later.length}</span></h2>
			<TaskList tasks={later} {today} viewer={v} show={['team', 'meeting']} back="/" />
		{/if}
		{#if data.shared.length > 0}
			<h2 class="section-title">Team boards <span class="count">{data.shared.length}</span></h2>
			<BoardTaskList tasks={data.shared} viewer={v} {today} back="/" />
		{/if}
		{#if data.assignedByMe.length > 0}
			<h2 class="section-title">Waiting on others <span class="count">{waiting}</span></h2>
			<TaskList tasks={data.assignedByMe} {today} viewer={v} show={['assignee', 'team']} back="/" groups={data.groups} />
		{/if}
		{#if data.recentDone.length > 0}
			<h2 class="section-title">Recently done</h2>
			<TaskList tasks={data.recentDone} {today} viewer={v} show={['team']} back="/" />
		{/if}
	</section>
	<aside>
		<h2 class="section-title">Coming up</h2>
		<MeetingList meetings={data.upcoming} {today} />
		<h2 class="section-title">My teams</h2>
		{#if data.myTeams.length}
			<ul class="my-team-list card">
				{#each data.myTeams as t (t.id)}
					{@const me = myRow(t.id)}
					{@const role = v.role === 'exec' ? 'Exec' : me?.is_lead ? 'Lead' : ''}
					<li>
						<a href="/teams/{t.id}">{t.name}</a>
						<span class="muted">{[me?.title, role].filter(Boolean).join(' · ') || `${data.teamMembers.filter((m) => m.team_id === t.id).length} people`}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty>You're not on a team yet.</Empty>
		{/if}
		<p class="hours-line">
			{#if v.available_hours == null}Your weekly hours aren’t set.{:else}You’re available <b>{v.available_hours} h</b> a week.{/if}
			<button type="button" class="link-btn" aria-haspopup="dialog" aria-controls="edit-availability" use:opensDialog={'edit-availability'}>
				{v.available_hours == null ? 'Set them' : 'Change'}
			</button>
		</p>
		<dialog id="edit-availability" class="members-dialog" aria-labelledby="edit-availability-title">
			<div class="members-dialog-content stack">
				<header>
					<h2 id="edit-availability-title">Hours you can give each week</h2>
					<form method="dialog">
						<button class="btn small">Close</button>
					</form>
				</header>
				<form class="stack" method="post" action="/availability">
					<Field label="Hours per week" hint="Leads see this when planning team work.">
						<input type="number" name="hours" min="0" max="168" step="any" value={v.available_hours ?? ''} />
					</Field>
					<div>
						<button class="btn small primary">Save</button>
					</div>
				</form>
			</div>
		</dialog>
		<h2 class="section-title">Recent meetings</h2>
		<MeetingList meetings={data.recent} {today} />
	</aside>
</div>
