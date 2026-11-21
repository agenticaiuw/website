<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { formatDate } from '$lib/dates';
	import { RATINGS } from '$lib/meetings';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if form?.thanks}
	<h1>Thanks, {form.thanks}</h1>
	<p class="sub">Your response is in. To change it, fill out the form again with the same email.</p>
	<a class="btn" href="/f/{data.token}" data-sveltekit-reload>Back to the form</a>
{:else}
	<p class="eyebrow">{data.meeting.title} · {formatDate(data.meeting.date)}</p>
	<h1>{data.formTitle}</h1>
	{#if data.closed}
		<p class="sub">This form is closed.</p>
	{:else}
		{#if data.error}
			<div class="system-notices"><Notice error>Fill in your name and a valid email.</Notice></div>
		{/if}
		<form method="post" action="/f/{data.token}" class="stack">
			<Field label="Name">
				<input name="name" required maxlength={100} autocomplete="name" value={data.me?.name ?? ''} />
			</Field>
			<Field label="Email">
				<input type="email" name="email" required maxlength={200} autocomplete="email" placeholder="you@wisc.edu" value={data.me?.email ?? ''} />
			</Field>
			{#each data.questions as q (q.id)}
				{#if q.kind === 'rating'}
					<div class="field" role="radiogroup" aria-label={q.label}>
						<span class="label">{q.label}</span>
						<div class="seg full rating">
							{#each RATINGS as n}
								<label>
									<input type="radio" name="a_{q.id}" value={n} />
									<span>{n}</span>
								</label>
							{/each}
						</div>
					</div>
				{:else}
					<Field label={q.label}>
						<textarea name="a_{q.id}" rows={3} maxlength={2000}></textarea>
					</Field>
				{/if}
			{/each}
			<button class="btn primary">Send</button>
		</form>
	{/if}
{/if}
