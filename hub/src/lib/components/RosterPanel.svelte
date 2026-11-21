<script lang="ts">
	import type { RosterMember, Team } from '$lib/types';
	import Empty from './Empty.svelte';
	import MemberOptions from './MemberOptions.svelte';
	import MembersDialog from './MembersDialog.svelte';
	import MemberTags from './MemberTags.svelte';
	import PostButton from './PostButton.svelte';

	/** A team's or subteam's people in a dialog. Execs also get page access and team options. */
	let {
		id,
		name,
		members,
		grantPath = undefined,
		team = undefined
	}: { id: string; name: string; members: RosterMember[]; grantPath?: string; team?: Pick<Team, 'id' | 'name' | 'kind'> } = $props();
</script>

<MembersDialog {id} {name} count={members.length}>
	{#if members.length}
		<ul class="team-members">
			{#each members as m}
				<li>
					<a href="/people/{m.id}">{m.name}</a> <MemberTags {m} />
					<span class="hint">{m.available_hours == null ? 'Hours not set' : `${m.available_hours} h/week`}</span>
					{#if m.can_manage_page}<span class="tag">Page admin</span>{/if}
					{#if grantPath}
						<PostButton
							action="{grantPath}/{m.id}"
							name="enabled"
							value={m.can_manage_page ? '0' : '1'}
							label={m.can_manage_page ? 'Remove page access' : 'Grant page access'}
							removeLabel={m.can_manage_page ? `Remove page access for ${m.name}` : undefined}
							cls="btn small"
						/>
					{/if}
					{#if team}<MemberOptions {team} m={{ ...m, member_id: m.id }} />{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<Empty>No members yet.</Empty>
	{/if}
</MembersDialog>
