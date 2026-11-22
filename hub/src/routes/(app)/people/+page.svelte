<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import NewPersonForm from '$lib/components/NewPersonForm.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Stat from '$lib/components/Stat.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { attendanceRate } from '$lib/people';
	import { pct } from '$lib/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const totals = $derived(
		data.exec
			? data.rows.reduce((s, r) => ({ open: s.open + r.open, overdue: s.overdue + r.overdue, people: s.people + (r.overdue ? 1 : 0) }), { open: 0, overdue: 0, people: 0 })
			: { open: 0, overdue: 0, people: 0 }
	);
</script>

{#if !data.exec}
	<PageHead title="People" sub="Everyone on the club roster." />
	<Tabs label="Teams or people" options={[["teams", "Teams"], ["people", "People"]]} current="people" href={(v) => `/${v}`} />
	<ul class="roster">
		{#each data.roster as r}
			<li>
				<a href="/people/{r.id}">{r.name}</a>
				<span class="muted">{[r.title, r.role === 'exec' && 'Exec', r.major, r.team_names].filter(Boolean).join(' · ')}</span>
			</li>
		{/each}
	</ul>
{:else}
	<PageHead title="People" sub="Who has what, what's late, and who shows up. Sorted by overdue work.">
		{#snippet actions()}
			<button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="add-people-dialog" data-members-dialog="add-people-dialog" use:opensDialog={'add-people-dialog'}>Add people</button>
		{/snippet}
	</PageHead>
	<Tabs label="Teams or people" options={[["teams", "Teams"], ["people", "People"]]} current="people" href={(v) => `/${v}`} />
	<dialog id="add-people-dialog" class="members-dialog" aria-labelledby="add-people-title" use:backdropClose>
		<div class="members-dialog-content stack">
			<header>
				<h2 id="add-people-title">Add people</h2>
				<form method="dialog"><button class="btn small">Close</button></form>
			</header>
			<NewPersonForm action="/people/add" teams={data.teams} />
			<details class="disclose">
				<summary>Add many at once</summary>
				<form method="post" action="/people/import" class="stack">
					<p class="hint">
						One per line: <code>Name, email</code>, with <code>, exec</code> on the end for execs. Anyone already on the roster is updated, not duplicated. Put people on teams from the Teams page.
					</p>
					<textarea name="lines" rows={6} placeholder={'Bucky Badger, bucky@wisc.edu\nAva Chen, achen@wisc.edu, exec'} required></textarea>
					<div><button class="btn primary">Add</button></div>
				</form>
			</details>
		</div>
	</dialog>
	<div class="stats">
		<Stat value={data.rows.length} label="People" />
		<Stat value={totals.open} label="Open tasks" />
		<Stat value={totals.overdue} label="Overdue tasks" tone={totals.overdue ? 'bad' : undefined} />
		<Stat value={totals.people} label="People with overdue work" tone={totals.people ? 'bad' : undefined} />
	</div>
	<div class="table-wrap">
		<table class="table board">
			<thead>
				<tr>
					<th>Name</th>
					<th>Teams</th>
					<th class="num">Open</th>
					<th class="num">Overdue</th>
					<th class="num">Done</th>
					<th class="num" title="Share of finished tasks done by their due date">On time</th>
					<th class="num" title="Meetings attended, not counting excused absences">Attendance</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as r}
					<tr class={r.active ? '' : 'inactive'}>
						<td>
							<a href="/people/{r.id}">{r.name}</a>
							{#if r.is_owner}<span class="tag exec">Owner</span>{:else if r.role === 'exec'}<span class="tag exec">Exec</span>{/if}
							{#if r.title}<span class="tag">{r.title}</span>{/if}
							{#if !r.active}<span class="tag">Inactive</span>{/if}
							<div class="muted small">{r.email}</div>
							{#if r.major}<div class="muted small">{r.major}</div>{/if}
						</td>
						<td class="small">{#if r.team_names}{r.team_names}{:else}<span class="muted">—</span>{/if}</td>
						<td class="num"><a href="/tasks?assignee={r.id}">{r.open}</a></td>
						<td class="num{r.overdue ? ' bad' : ''}"><a href="/tasks?status=overdue&assignee={r.id}">{r.overdue}</a></td>
						<td class="num">{r.done}</td>
						<td class="num">{pct(r.on_time, r.done)}</td>
						<td class="num">
							{attendanceRate(r)}
							{#if r.marked > 0}<div class="muted small">{r.attended}/{r.marked - r.excused}</div>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="hint">
		<a href={data.showInactive ? '/people' : '/people?inactive=1'}>{data.showInactive ? 'Hide' : 'Show'} inactive people</a>
	</p>
{/if}
