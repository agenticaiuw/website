<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { MAJORS } from '$lib/majors';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const names = (list: string[]) => (list.length < 3 ? list.join(' or ') : `${list.slice(0, -1).join(', ')} or ${list.at(-1)}`);
</script>

{#if form?.thanks}
	<h1>Thanks, {form.thanks}</h1>
	{#if form.cal}
		<p class="sub">Book a meeting with the head of {form.team} to join the team.</p>
		<a class="btn primary" href={form.cal} target="_blank" rel="noopener noreferrer">Book a meeting ↗</a>
	{:else if form.heads.length}
		<p class="sub">{form.team} doesn't have a meeting link yet. Reach out to {names(form.heads)}.</p>
	{:else}
		<p class="sub">{form.team} doesn't have a meeting link yet.</p>
	{/if}
{:else}
	<h1>Join a team</h1>
	<p class="sub">Pick the team you want to join, then book a meeting with its head.</p>
	{#if data.error}
		<div class="system-notices">
			<Notice error>{data.error === 'busy' ? 'Too many sign-ups right now. Try again in a few minutes.' : 'Fill in your full name, major and team.'}</Notice>
		</div>
	{/if}
	<form method="post" action="/join" class="stack">
		<Field label="Full name">
			<input name="name" required maxlength={100} autocomplete="name" />
		</Field>
		<Field label="Major">
			<select name="major" required>
				<option value="" disabled selected>Choose your major</option>
				{#each MAJORS as major}<option>{major}</option>{/each}
			</select>
		</Field>
		<Field label="Team">
			<select name="team" required>
				<option value="" disabled selected>Choose a team</option>
				{#each data.teams as team (team.id)}<option value={team.id}>{team.name}</option>{/each}
			</select>
		</Field>
		<input class="join-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
		<button class="btn primary">Sign up</button>
	</form>
{/if}

<style>
	.join-trap { position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0; }
</style>
