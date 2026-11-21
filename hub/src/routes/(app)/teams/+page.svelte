<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import Field from '$lib/components/Field.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import TeamCard from '$lib/components/TeamCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const current = $derived(data.teams.filter((t) => !t.archived));
	const archived = $derived(data.teams.filter((t) => t.archived));
</script>

{#snippet card(t: PageData['teams'][number])}
	<TeamCard team={t} links={data.links} people={data.people} teamList={data.teams} editable={data.editable} open={data.open.get(t.id) ?? 0} />
{/snippet}

<PageHead title="Teams" sub={data.editable ? undefined : 'Every project team in the club. Open one to see its board and meetings.'}>
	{#snippet actions()}
		{#if data.editable}
			<button type="button" class="btn primary" aria-haspopup="dialog" aria-controls="add-team-dialog" data-members-dialog="add-team-dialog" use:opensDialog={'add-team-dialog'}>New team</button>
		{/if}
	{/snippet}
</PageHead>
{#if data.editable}
	<dialog id="add-team-dialog" class="members-dialog" aria-labelledby="add-team-title" use:backdropClose>
		<div class="members-dialog-content stack">
			<header>
				<h2 id="add-team-title">Add team</h2>
				<form method="dialog"><button class="btn small">Close</button></form>
			</header>
			<form method="post" action="/teams" class="stack">
				<Field label="Team name"><input name="name" required maxlength={100} placeholder="New team name" /></Field>
				<div><button class="btn primary">Add team</button></div>
			</form>
		</div>
	</dialog>
{/if}
<div class="teams">{#each current as t (t.id)}{@render card(t)}{/each}</div>
{#if archived.length > 0}
	<details class="archived-teams">
		<summary>Archived teams ({archived.length})</summary>
		<div class="teams">{#each archived as t (t.id)}{@render card(t)}{/each}</div>
	</details>
{/if}
