<script lang="ts">
	import Section from '$lib/components/Section.svelte';
</script>

<!-- Cloudflare Pages serves this, with a 404 status, for any address that isn't a page.
     The same words as SvelteKit's own error page, which the site showed before. -->
<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<Section id="not-found" heading="404" lede="Not Found">
	{#snippet children()}{/snippet}
</Section>
