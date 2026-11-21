<script lang="ts">
	import CodeForm from '$lib/components/CodeForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if form}
	<CodeForm {...form} />
{:else}
	<h1>Sign in</h1>
	<p class="sub">For Agentic AI UW execs and project members. We'll email you a 6-digit code; no password needed.</p>
	<form method="post" action="/login" class="stack">
		<input type="hidden" name="next" value={data.next} />
		<label class="field">
			<span class="label">Email</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input type="email" name="email" required autocomplete="email" autofocus placeholder="you@wisc.edu" />
		</label>
		<button class="btn primary">Email me a code</button>
	</form>
	<p class="hint">Not on the roster yet? Ask an exec to add you.</p>
{/if}
