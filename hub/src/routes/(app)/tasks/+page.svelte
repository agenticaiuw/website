<script lang="ts">
	import { page } from '$app/state';
	import { submitOnSelect } from '$lib/actions.js';
	import BoardTaskList from '$lib/components/BoardTaskList.svelte';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import TaskList from '$lib/components/TaskList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const back = $derived(page.url.pathname + page.url.search);
	const withStatus = (s: string | null) => {
		const u = new URL(page.url);
		u.searchParams.set('status', s ?? 'open');
		return u.pathname + u.search;
	};
</script>

<PageHead title="Tasks" sub="Every task in the club.">
	{#snippet actions()}<a class="btn primary" href="/tasks/new">New task</a>{/snippet}
</PageHead>
<form class="toolbar" method="get" action="/tasks" use:submitOnSelect>
	<input type="hidden" name="status" value={data.status} />
	<Tabs
		label="Status"
		current={data.status}
		href={withStatus}
		options={[
			['open', 'Open'],
			['overdue', 'Overdue'],
			['done', 'Done'],
			['dropped', 'Dropped'],
			['all', 'All']
		]}
	/>
	<MemberSelect name="assignee" members={data.people} selected={data.assignee} blank="Anyone" label="Assignee" />
	<select name="team" aria-label="Team">
		<option value="" selected={!data.team}>Any team</option>
		{#each data.teamList as t (t.id)}<option value={String(t.id)} selected={data.team === t.id}>{t.name}</option>{/each}
	</select>
	<input type="search" name="q" value={data.q} placeholder="Search tasks" aria-label="Search tasks" />
	<button class="btn js-hide">Filter</button>
</form>
{#if data.sharedTasks.length > 0}<BoardTaskList tasks={data.sharedTasks} viewer={data.viewer} today={data.today} {back} />{/if}
{#if data.tasks.length > 0 || !data.sharedTasks.length}
	<TaskList tasks={data.tasks} today={data.today} viewer={data.viewer} show={['assignee', 'team', 'meeting']} {back} empty="No tasks match." groups={data.groups} />
{/if}
