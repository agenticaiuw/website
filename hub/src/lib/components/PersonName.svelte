<script lang="ts">
	import type { Named } from '$lib/ui';

	/** A person's name, with their NetID after it when someone else in the list has the same name. */
	let { p, netId }: { p: Named; netId: (p: Named) => string } = $props();
	const id = $derived(netId(p));
</script>

{p.name}{#if id}<small class="netid">{' '}{id}</small>{/if}
