<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Pages for signed-out visitors: sign-in, the email "mark done" confirmation, public forms. */
	let { children }: { children: Snippet } = $props();
</script>

<main class="solo">
	<a href="/" class="brand">
		<img src="/favicon.svg" alt="" width="36" height="36" />
		<span class="brand-text">The <span class="brand-hub">Hub</span></span>
	</a>
	<img class="solo-badge" src="/badge-wave.svg" alt="" width="116" height="106" />
	<div class="card solo-card">{@render children()}</div>
</main>
