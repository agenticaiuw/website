<script lang="ts">
	import Field from './Field.svelte';
	import TeamSelect from './TeamSelect.svelte';

	/** Full name and email for someone not on the roster yet; with `teams`, a team to put them on. */
	let { action, teams = undefined, heading = undefined }: { action: string; teams?: { id: number; name: string }[]; heading?: string } = $props();
</script>

<form method="post" {action} class="stack new-person">
	{#if heading}<p class="label">{heading}</p>{/if}
	<div class="field-pair">
		<Field label="Full name"><input name="name" required maxlength={100} autocomplete="off" /></Field>
		<Field label="Email"><input type="email" name="email" required maxlength={200} autocomplete="off" /></Field>
	</div>
	{#if teams}
		<Field label="Team"><TeamSelect name="team" {teams} blank="No team" /></Field>
	{/if}
	<div><button class="btn primary small">Add</button></div>
</form>
