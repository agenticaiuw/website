<script lang="ts">
	import CodeForm from '$lib/components/CodeForm.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

{#if form}<CodeForm {...form} />{/if}
