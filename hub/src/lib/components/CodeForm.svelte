<script lang="ts">
	import Notice from './Notice.svelte';

	/** The same page whether or not the address is on the roster, so it can't be used to check who is. */
	let { email, next, from, error, devCode }: { email: string; next: string; from: string; error?: string; devCode?: string | null } = $props();
</script>

<h1>Check your email</h1>
<p class="sub">
	If <strong>{email || 'that address'}</strong> is on the club roster, a 6-digit code is on its way from {from}. It expires in 10 minutes.
</p>
{#if error}<div class="system-notices"><Notice error>{error}</Notice></div>{/if}
{#if devCode}
	<p class="flash ok">
		Local dev mode: your code is <strong>{devCode}</strong>
	</p>
{/if}
<form method="post" action="/verify" class="stack">
	<input type="hidden" name="email" value={email} />
	<input type="hidden" name="next" value={next} />
	<label class="field">
		<span class="label">Code</span>
		<!-- svelte-ignore a11y_autofocus -->
		<input name="code" class="code-input" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{'{'}6,7{'}'}" maxlength={7} autofocus placeholder="123456" />
	</label>
	<button class="btn primary">Sign in</button>
</form>
<div class="hint">
	<form method="post" action="/login" class="inline">
		<input type="hidden" name="email" value={email} />
		<input type="hidden" name="next" value={next} />
		<button class="link-btn">Send a new code</button>
	</form>
	{' · '}
	<a href={`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`}>Use a different email</a>
</div>
