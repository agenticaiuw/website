<script lang="ts">
	import { page } from '$app/state';
	import { siteUrl, ogImage, ogImageAlt } from '$lib/seo';
	import { site } from '$lib/site';

	/* Title, description and the link-preview tags for one page. The canonical
	   link lives in the layout. */
	interface Props {
		title: string;
		/** Search snippet; keep it near 155 characters. */
		description: string;
		/** Link-preview text, which can run longer. Defaults to `description`. */
		shareDescription?: string;
	}
	let { title, description, shareDescription = description }: Props = $props();
	const image = ogImage(site());
	const imageAlt = ogImageAlt(site());
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{siteUrl}{page.url.pathname}" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={shareDescription} />
	<meta property="og:image" content={image.url} />
	<meta property="og:image:width" content={String(image.width)} />
	<meta property="og:image:height" content={String(image.height)} />
	<meta property="og:image:alt" content={imageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@AgenticAIUW" />
</svelte:head>
