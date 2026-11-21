<script lang="ts">
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { globalBehaviors } from '$lib/actions.js';

	let { children }: { children: Snippet } = $props();
	onMount(globalBehaviors);
</script>

<svelte:head>
	<title>{(page.form as { title?: string } | null)?.title ?? page.data.title ?? (page.error ? (page.status === 404 ? page.error.message : 'Something went wrong') : 'Hub')} · Agentic AI UW Hub</title>
</svelte:head>

{@render children()}
