<script lang="ts">
	import BoardTaskList from '$lib/components/BoardTaskList.svelte';
	import Choice from '$lib/components/Choice.svelte';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import { formatDate } from '$lib/dates';
	import { attendanceRate } from '$lib/people';
	import { isExec, isOwner } from '$lib/perm';
	import { pct } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const v = $derived(data.viewer);
	const p = $derived(data.person);
	const back = $derived(`/people/${p.id}`);
	const teams = $derived(
		data.memberships
			.map((t) => {
				const about = [t.is_lead && 'lead', t.team_title].filter(Boolean).join(', ');
				return t.name + (about ? ` (${about})` : '');
			})
			.join(', ')
	);
	// The pieces of the line under the name, in order; the GitHub one is a link.
	type Part = { text: string; github?: boolean };
	const parts = $derived(
		[
			(isExec(v) || data.self) && p.email ? { text: p.email } : null,
			p.major ? { text: p.major } : null,
			p.discord ? { text: `Discord: ${p.discord}` } : null,
			p.github ? { text: p.github, github: true } : null,
			teams ? { text: teams } : null
		].filter((x): x is Part => !!x)
	);
</script>

<PageHead eyebrow={p.title || (isOwner(p) ? 'Owner' : p.role === 'exec' ? 'Exec' : 'Member')} title={p.name} sub={parts.length ? sub : undefined}>
	{#snippet actions()}
		{#if isExec(v)}<a class="btn" href="/tasks/new?assignee={p.id}">Assign a task</a>{/if}
	{/snippet}
</PageHead>
{#snippet sub()}
	{#each parts as part, i}{#if i}{' · '}{/if}{#if part.github}<span class="nowrap">GitHub: <a href="https://github.com/{encodeURIComponent(part.text)}" rel="noopener">{part.text}</a></span>{:else}{part.text}{/if}{/each}
{/snippet}
{#if isExec(v) || data.self}
	<div class="stats">
		<Stat value={p.open} label="Open" />
		<Stat value={p.overdue} label="Overdue" tone={p.overdue ? 'bad' : undefined} />
		<Stat value={pct(p.on_time, p.done)} label="On time ({p.done} done)" />
		<Stat value={attendanceRate(p)} label="Attendance" />
	</div>
{/if}
<div class="grid-2 wide-left">
	<section>
		<h2 class="section-title">Open tasks</h2>
		<TaskList tasks={data.open} today={data.today} viewer={v} show={['team', 'meeting']} {back} empty="No open tasks." />
		{#if data.closed.length > 0}
			<h2 class="section-title">Finished</h2>
			<TaskList tasks={data.closed} today={data.today} viewer={v} show={['team']} {back} />
		{/if}
		{#if data.shared.length > 0}
			<h2 class="section-title">Team board tasks</h2>
			<BoardTaskList tasks={data.shared} viewer={v} today={data.today} {back} />
		{/if}
	</section>
	<aside>
		<h2 class="section-title">Meetings</h2>
		{#if data.meetings.length}
			<ul class="att-list">
				{#each data.meetings as m}
					<li>
						<a href="/meetings/{m.id}">{m.title} <span class="muted">· {formatDate(m.date, data.today)}</span></a>
						<span class="pill att-{m.status}">{m.status}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty>No attendance recorded.</Empty>
		{/if}
		{#if data.canEdit}
			<details class="card disclose">
				<summary>Edit profile</summary>
				<form method="post" action="/people/{p.id}" class="stack">
					<Field label="Name"><input name="name" required maxlength={100} value={p.name} /></Field>
					<Field label="Email"><input type="email" name="email" required maxlength={200} value={p.email} /></Field>
					<Field label="Title" hint="Optional, shown next to their name. Like Advisor."><input name="title" maxlength={60} value={p.title} /></Field>
					<Field label="Major"><input name="major" maxlength={120} value={p.major ?? ''} /></Field>
					<Field label="Discord"><input name="discord" maxlength={100} value={p.discord} /></Field>
					<Field label="GitHub"><input name="github" maxlength={100} value={p.github} /></Field>
					{#if data.rolesOk}
						<Choice
							name="role"
							label="Role"
							selected={p.role}
							options={[
								['member', 'Member'],
								['exec', 'Exec']
							]}
						/>
					{:else}
						<p class="hint">Role: {p.role === 'exec' ? 'Exec' : 'Member'}. Only the site owner can change roles.</p>
					{/if}
					<label class="check"><input type="checkbox" name="active" value="1" checked={!!p.active} /> Active: can sign in and gets reminders</label>
					<div><button class="btn primary">Save</button></div>
				</form>
			</details>
		{/if}
	</aside>
</div>
