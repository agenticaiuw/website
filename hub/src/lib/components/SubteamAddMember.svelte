<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import type { RosterMember, Subteam } from '$lib/types';
	import Field from './Field.svelte';
	import MemberSelect from './MemberSelect.svelte';

	let {
		root,
		subteam,
		members,
		subRoster,
		origin
	}: { root: string; subteam: Subteam; members: RosterMember[]; subRoster: { subteam_id: number; member_id: number }[]; origin: 'team' | 'subteam' } = $props();
	const dialogId = $derived(`subteam-${subteam.id}-add-${origin}`);
	const available = $derived(members.filter((member) => !subRoster.some((entry) => entry.subteam_id === subteam.id && entry.member_id === member.id)));
</script>

<div class="subteam-add-member">
	<button
		type="button"
		class="icon-btn team-add-button"
		aria-label="Add member to {subteam.name}"
		title="Add member to {subteam.name}"
		aria-haspopup="dialog"
		aria-controls={dialogId}
		data-members-dialog={dialogId}
		use:opensDialog={dialogId}>+</button
	>
	<dialog id={dialogId} class="members-dialog" aria-labelledby="{dialogId}-title" use:backdropClose>
		<div class="members-dialog-content stack">
			<header>
				<h2 id="{dialogId}-title">Add member to {subteam.name}</h2>
				<form method="dialog"><button class="btn small">Close</button></form>
			</header>
			{#if available.length}
				<form method="post" action="{root}/subteams/{subteam.id}/members" class="stack">
					<input type="hidden" name="origin" value={origin} />
					<Field label="Team member"><MemberSelect name="member" members={available} blank="Choose a team member" required /></Field>
					<div><button class="btn primary small">Add member</button></div>
				</form>
			{:else}
				<p class="hint">All team members are already in this subteam.</p>
			{/if}
		</div>
	</dialog>
</div>
