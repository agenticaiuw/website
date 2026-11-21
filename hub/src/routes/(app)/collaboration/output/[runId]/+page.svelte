<script lang="ts">
	import PageHead from '$lib/components/PageHead.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<PageHead title="Run output" sub="Run {data.runId}" />
<p><a href="/collaboration">Back to collaboration</a></p>
<pre>{data.output}</pre>
