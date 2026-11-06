<script lang="ts">
	import Hub from '$lib/components/Hub.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { club, vision } from '$lib/content';
	import { siteUrl, jsonLd, organization } from '$lib/seo';

	// WebSite tells Google which name to show for the site in search results;
	// Organization is the club's entry for search engines and AI assistants.
	const homeJsonLd = jsonLd({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${siteUrl}/#website`,
				name: club.name,
				alternateName: ['AgenticAIUW', `${club.shortName} at UW–Madison`],
				url: `${siteUrl}/`,
				publisher: { '@id': organization['@id'] }
			},
			organization
		]
	});
</script>

<Meta title="{club.name} · Agentic AI student club at UW–Madison" description={club.summary} shareDescription={vision.text} />

<svelte:head>
	{@html homeJsonLd}
</svelte:head>

<Hub />
