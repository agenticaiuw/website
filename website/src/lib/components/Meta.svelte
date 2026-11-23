<script lang="ts">
	import { page } from '$app/state';
	import { siteUrl, ogImage, ogImageAlt, openingLine } from '$lib/seo';
	import { site } from '$lib/site';

	/* Title, description and the link-preview tags for one page. The canonical
	   link lives in the layout. The description, in search results and link previews
	   (Discord, iMessage, Slack), is the page's own opening line, also drawn on its image. */
	let { title }: { title: string } = $props();
	const description = $derived(openingLine(site(), page.url.pathname));
	const image = $derived(ogImage(site(), page.url.pathname));
	const imageAlt = ogImageAlt(site());
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{siteUrl}{page.url.pathname}" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image.url} />
	<meta property="og:image:width" content={String(image.width)} />
	<meta property="og:image:height" content={String(image.height)} />
	<meta property="og:image:alt" content={imageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@AgenticAIUW" />
</svelte:head>
