<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { club, faq } from '$lib/content';
	import { jsonLd } from '$lib/seo';

	// Lets search engines and AI assistants quote each answer as written.
	const faqJsonLd = jsonLd({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faq.items.map((f) => ({
			'@type': 'Question',
			name: f.q,
			acceptedAnswer: { '@type': 'Answer', text: f.a }
		}))
	});

	const external = (href: string) => /^https?:\/\//.test(href);
</script>

<Meta title="FAQ · {club.name}" description="Answers about {club.name} at UW–Madison: our vision, what agentic AI is, what we’re building, who can join, how to join and how to reach us." />

<svelte:head>
	{@html faqJsonLd}
</svelte:head>

<div class="pt-16">
	<Section id="faq" heading={faq.heading} lede={faq.lede}>
		<div class="border-t" style:border-color="var(--line)">
			{#each faq.items as f (f.q)}
				<article data-reveal class="grid gap-3 border-b py-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-12" style:border-color="var(--line)">
					<h2 class="text-lg leading-snug md:text-xl">{f.q}</h2>
					<div>
						<p class="leading-relaxed" style:color="var(--muted)">{f.a}</p>
						{#if f.links}
							<p class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
								{#each f.links as l (l.href)}
									<a
										href={l.href}
										target={external(l.href) ? '_blank' : undefined}
										rel={external(l.href) ? 'noopener noreferrer' : undefined}
										class="font-medium hover:underline"
										style:color="var(--accent)"
									>{l.label}{external(l.href) ? ' ↗' : ''}</a>
								{/each}
							</p>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	</Section>
	<PageNav />
</div>
