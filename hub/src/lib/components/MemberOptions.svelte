<script lang="ts">
	import type { Role, Team } from '$lib/types';
	import Field from './Field.svelte';
	import Menu from './Menu.svelte';
	import PostButton from './PostButton.svelte';

	/** An exec's menu for one person on a team: their title there, whether they lead it, or taking them off. */
	let { team, m }: { team: Pick<Team, 'id' | 'name' | 'kind'>; m: { member_id: number; name: string; title: string; role: Role; is_lead: number } } = $props();
</script>

<Menu label="Options for {m.name}" form>
	<form method="post" action="/teams/{team.id}/members/{m.member_id}" class="stack">
		<Field label="Title on {team.name}" hint="Optional, e.g. Firmware or Project manager"><input name="title" maxlength={60} value={m.title} /></Field>
		{#if m.role === 'exec'}
			<span class="hint">Execs run every team, so they show as Exec.</span>
		{:else if team.kind !== 'exec'}
			<label class="check"><input type="checkbox" name="lead" value="1" checked={!!m.is_lead} /> Lead of {team.name}</label>
		{/if}
		<div><button class="btn primary small">Save</button></div>
	</form>
	<PostButton action="/teams/{team.id}/members/{m.member_id}/remove" label="Remove from {team.name}" removeLabel="Remove {m.name} from {team.name}" cls="item danger" />
</Menu>
