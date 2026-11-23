<script lang="ts">
	import { tick } from 'svelte';

	/** Saves the email to the hub's newsletter list. */
	const ENDPOINT = 'https://hub.agenticaiuw.com/api/newsletter';

	let { text }: { text: { heading: string; placeholder: string; button: string; done: string; error: string } } = $props();

	let status = $state<'idle' | 'sending' | 'done' | 'error'>('idle');
	let done = $state<HTMLParagraphElement>();

	async function submit(ev: SubmitEvent) {
		ev.preventDefault();
		if (status === 'sending') return;
		const form = ev.currentTarget as HTMLFormElement;
		status = 'sending';
		try {
			const res = await fetch(ENDPOINT, { method: 'POST', body: new FormData(form), credentials: 'omit', signal: AbortSignal.timeout(15_000) });
			const result: unknown = await res.json().catch(() => null);
			if (!res.ok || !result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) throw new Error(String(res.status));
			status = 'done';
			await tick();
			done?.focus();
		} catch {
			status = 'error';
		}
	}
</script>

<div class="f-news">
	<h2 class="f-head" id="newsletter">{text.heading}</h2>
	{#if status === 'done'}
		<p class="note" role="status" tabindex="-1" bind:this={done}>{text.done}</p>
	{:else}
		<form method="post" action={ENDPOINT} onsubmit={submit} aria-labelledby="newsletter" aria-busy={status === 'sending'}>
			<input type="email" name="email" required maxlength="254" autocomplete="email" placeholder={text.placeholder} aria-label={text.placeholder} disabled={status === 'sending'} />
			<!-- Left empty by people; bots fill it in. -->
			<input class="trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
			<button class="btn btn-red btn-sm" disabled={status === 'sending'}>{text.button}</button>
		</form>
		{#if status === 'error'}<p class="note err" role="alert">{text.error}</p>{/if}
	{/if}
</div>

<style>
	/* A row across the bottom of the footer card: heading, then the email box and button. */
	.f-news { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 0.9rem 1.5rem; min-width: 0; padding-top: 1.75rem; border-top: 1px solid var(--line); }
	form { display: flex; flex-wrap: wrap; flex: 0 1 26rem; gap: 0.6rem; min-width: 0; }
	input[type='email'] {
		flex: 1 1 11rem;
		min-width: 0;
		min-height: 2.5rem;
		padding: 0.45rem 1rem;
		border: 1.5px solid var(--line-strong);
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--fg);
		font: inherit;
		font-size: 0.95rem;
	}
	input[type='email']::placeholder { color: var(--faint); }
	input[type='email']:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
	.trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
	button:disabled { opacity: 0.6; }
	.note { font-size: 0.95rem; line-height: 1.55; color: var(--muted); }
	.note:focus { outline: none; }
	.err { flex-basis: 100%; color: var(--fg); }
</style>
