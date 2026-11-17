<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { site } from '$lib/site';

	const { faq, pages } = site();
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

<Meta title={pages.faq.title} description={pages.faq.description} />

<svelte:head>
	{@html faqJsonLd}
</svelte:head>

<div>
	<Section id="faq" heading={faq.heading} lede={faq.lede} mascot={{ prop: 'architecture', mood: 'rest' }}>
		<div class="faq-list">
			{#each faq.items as f (f.q)}
				<article data-reveal class="card faq-item">
					<h2>{f.q}</h2>
					<div>
						<p class="answer">{f.a}</p>
						{#if f.links}
							<p class="faq-links">
								{#each f.links as l (l.href)}
									<a
										href={l.href}
										target={external(l.href) ? '_blank' : undefined}
										rel={external(l.href) ? 'noopener noreferrer' : undefined}
									>{l.label}{external(l.href) ? ' ↗' : ' →'}</a>
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

<style>
	.faq-list { display: grid; gap: 0.75rem; }
	.faq-item { display: grid; gap: 0.6rem 3rem; padding: clamp(1.25rem, 3vw, 1.75rem); }
	.faq-item h2 { font-size: clamp(1.2rem, 2vw, 1.4rem); line-height: 1.25; }
	.answer { font-size: 1rem; line-height: 1.65; color: var(--muted); }
	.faq-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.9rem; }
	.faq-links a { padding: 0.3rem 0.85rem; border-radius: 999px; border: 1.5px solid var(--line-strong); font-family: var(--font-display); font-size: 0.95rem; font-weight: 600; line-height: 1.3; color: var(--fg); transition: border-color .2s ease, color .2s ease; }
	.faq-links a:hover { border-color: var(--accent); color: var(--accent); }
	@media (min-width: 768px) { .faq-item { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); } }
</style>
