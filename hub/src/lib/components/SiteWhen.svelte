<script lang="ts">
	import { formatTimestamp } from '$lib/dates';

	let { iso, zone }: { iso: string; zone: string } = $props();
</script>

<time datetime={iso} title={iso}>{formatTimestamp(iso, zone)}</time>
