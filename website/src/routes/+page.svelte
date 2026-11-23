<script lang="ts">
	import Hub from '$lib/components/Hub.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';
	import { siteUrl, jsonLd, organization } from '$lib/seo';

	const c = site();
	const { club, pages } = c;

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
				publisher: { '@id': `${siteUrl}/#organization` }
			},
			organization(c)
		]
	});
</script>

<Meta title={pages.home.title} description={pages.home.description} />

<svelte:head>
	{@html homeJsonLd}
</svelte:head>

<Hub />
