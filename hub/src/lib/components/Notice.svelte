<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	let { error = false, children }: { error?: boolean; children: Snippet } = $props();
	let hidden = $state(false);
	onMount(() => {
		const timer = setTimeout(() => (hidden = true), 5000);
		return () => clearTimeout(timer);
	});
</script>

<div class="system-notice {error ? 'err' : 'ok'}" data-system-notice role={error ? 'alert' : 'status'} {hidden}>
	<span class="system-notice-icon" aria-hidden="true">{error ? '!' : '✓'}</span>
	<div class="system-notice-text">{@render children()}</div>
	<button type="button" class="system-notice-close" aria-label="Dismiss notification" data-dismiss-notice onclick={() => (hidden = true)}>×</button>
</div>
