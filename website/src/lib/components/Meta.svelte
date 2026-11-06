<script lang="ts">
	import { page } from '$app/state';
	import { siteUrl, ogImage } from '$lib/seo';

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
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{siteUrl}{page.url.pathname}" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={shareDescription} />
	<meta property="og:image" content={ogImage.url} />
	<meta property="og:image:width" content={String(ogImage.width)} />
	<meta property="og:image:height" content={String(ogImage.height)} />
	<meta property="og:image:alt" content={ogImage.alt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@AgenticAIUW" />
</svelte:head>
