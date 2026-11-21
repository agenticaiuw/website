<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import type { RosterMember, Subteam } from '$lib/types';
	import Field from './Field.svelte';
	import RosterPanel from './RosterPanel.svelte';
	import SubteamAddMember from './SubteamAddMember.svelte';

	let {
		root,
		subteams,
		members,
		subRoster,
		editable
	}: { root: string; subteams: Subteam[]; members: RosterMember[]; subRoster: { subteam_id: number; member_id: number }[]; editable: boolean } = $props();
	const visible = $derived(subteams.filter((subteam) => !subteam.archived || editable));
	const onSubteam = (subteam: Subteam) => members.filter((m) => subRoster.some((r) => r.subteam_id === subteam.id && r.member_id === m.id));
</script>

{#if visible.length || editable}
	<section class="subteams-section" aria-labelledby="subteams-heading">
		<div class="subteams-heading">
			<h2 id="subteams-heading" class="section-title">Subteams</h2>
			{#if editable}<button
					type="button"
					class="icon-btn team-add-button"
					aria-label="Add subteam"
					title="Add subteam"
					aria-haspopup="dialog"
					aria-controls="new-subteam"
					data-members-dialog="new-subteam"
					use:opensDialog={'new-subteam'}>+</button
				>{/if}
		</div>
		{#if visible.length}
			<div class="teams">
				{#each visible as subteam (subteam.id)}
					<section class="card team{subteam.archived ? ' inactive' : ''}">
						<header class="team-head">
							<div>
								<h2><a class="team-card-link" href="{root}/subteams/{subteam.id}">{subteam.name}</a></h2>
								{#if subteam.description}<p>{subteam.description}</p>{/if}{#if subteam.archived}<p>Archived</p>{/if}
							</div>
						</header>
						<div class="team-actions">
							<RosterPanel id="subteam-card-{subteam.id}-members" name={subteam.name} members={onSubteam(subteam)} />
							{#if editable && !subteam.archived}<SubteamAddMember {root} {subteam} {members} {subRoster} origin="team" />{/if}
						</div>
					</section>
				{/each}
			</div>
		{:else}
			<p class="hint">No subteams yet.</p>
		{/if}
		{#if editable}
			<dialog id="new-subteam" class="members-dialog" aria-labelledby="new-subteam-title" use:backdropClose>
				<div class="members-dialog-content stack">
					<header>
						<h2 id="new-subteam-title">Add subteam</h2>
						<form method="dialog"><button class="btn small">Close</button></form>
					</header>
					<form class="stack" method="post" action="{root}/subteams">
						<Field label="Subteam name"><input name="name" maxlength={100} required /></Field>
						<div><button class="btn small primary">Create subteam</button></div>
					</form>
				</div>
			</dialog>
		{/if}
	</section>
{/if}
