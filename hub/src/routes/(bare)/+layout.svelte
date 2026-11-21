<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Full-screen pages with no sidebar: the form's QR code for the projector. */
	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
