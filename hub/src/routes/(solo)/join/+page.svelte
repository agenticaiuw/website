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
	{#if form.bookings.length === 1}
		{@const b = form.bookings[0]}
		<p class="sub">Book a meeting with {b.name ? `${b.name}, the head of ${form.team},` : `the head of ${form.team}`} to join the team.</p>
		<a class="btn primary" href={b.url} target="_blank" rel="noopener noreferrer">Book a meeting{b.name ? ` with ${b.name.split(' ')[0]}` : ''} ↗</a>
	{:else if form.bookings.length}
		<p class="sub">{form.team} has {form.bookings.length === 2 ? 'two heads' : `${form.bookings.length} heads`}. Book a meeting with {form.bookings.length === 2 ? 'either' : 'any'} of them to join the team.</p>
		<div class="join-bookings">
			{#each form.bookings as b (b.url)}
				<a class="btn primary" href={b.url} target="_blank" rel="noopener noreferrer">Book with {b.name || 'a head'} ↗</a>
			{/each}
		</div>
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
	.join-bookings { display: flex; flex-wrap: wrap; gap: 12px; }
	.join-trap { position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0; }
</style>
