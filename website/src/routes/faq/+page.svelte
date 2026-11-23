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
	/* Two columns of questions on wide screens; on phones the second follows the first. */
	const half = Math.ceil(faq.items.length / 2);
	const columns = [faq.items.slice(0, half), faq.items.slice(half)];
</script>

<Meta title={pages.faq.title} />

<svelte:head>
	{@html faqJsonLd}
</svelte:head>

<div>
	<!-- One slide: every question on one screen; each opens to its answer. -->
	<Section id="faq" heading={faq.heading} lede={faq.lede} mascot={{ prop: 'architecture', mood: 'rest' }}>
		<div class="faq-cols">
			{#each columns as items, c (c)}
				<div class="faq-col" data-stagger>
					{#each items as f (f.q)}
						<details class="faq-item" name="faq" data-reveal>
							<summary>
								<h2>{f.q}</h2>
								<span class="plus" aria-hidden="true"></span>
							</summary>
							<div class="answer-wrap">
								<p class="answer">{f.a}</p>
								{#if f.links?.length}
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
						</details>
					{/each}
				</div>
			{/each}
		</div>
	</Section>
	<PageNav />
</div>

<style>
	/* the questions stay put as answers open below them */
	:global(#faq.slide) { justify-content: flex-start; }
	.faq-cols { display: grid; gap: 0 clamp(1.5rem, 4vw, 3.5rem); align-items: start; }
	@media (min-width: 700px) { .faq-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	.faq-col { border-top: 1px solid var(--line-strong); }
	@media (max-width: 699px) { .faq-col + .faq-col { border-top: 0; } }

	.faq-item { border-bottom: 1px solid var(--line-strong); interpolate-size: allow-keywords; }
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-block: clamp(0.7rem, 2svh, 1.1rem);
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker { display: none; }
	summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 4px; }
	summary h2 {
		min-width: 0;
		font-family: var(--font-sans);
		font-size: clamp(1.02rem, min(1.4vw, 2.6svh), 1.25rem);
		font-weight: 700;
		line-height: 1.3;
		letter-spacing: -0.01em;
		color: var(--fg);
		transition: color 0.2s ease;
	}
	summary:hover h2, .faq-item[open] summary h2 { color: var(--accent); }

	/* a plus that turns into a minus when the answer is open */
	.plus { position: relative; flex: none; width: 1.75rem; height: 1.75rem; border-radius: 999px; border: 1.5px solid var(--line-strong); transition: border-color 0.2s ease, transform 0.3s var(--ease-out-expo); }
	.plus::before, .plus::after { content: ''; position: absolute; inset: 50% auto auto 50%; width: 0.7rem; height: 2px; margin: -1px 0 0 -0.35rem; border-radius: 2px; background: var(--fg); transition: transform 0.3s var(--ease-out-expo); }
	.plus::after { transform: rotate(90deg); }
	summary:hover .plus { border-color: var(--accent); }
	.faq-item[open] .plus { border-color: var(--accent); transform: rotate(180deg); }
	.faq-item[open] .plus::after { transform: rotate(0deg); }

	/* The answer slides open where the browser can animate to its height. */
	.faq-item::details-content { block-size: 0; overflow: clip; transition: block-size 0.35s var(--ease-out-expo), content-visibility 0.35s allow-discrete; }
	.faq-item[open]::details-content { block-size: auto; }

	.answer-wrap { padding: 0 2.75rem clamp(0.9rem, 2.4svh, 1.35rem) 0; }
	.answer { font-size: 1rem; line-height: 1.6; color: var(--muted); }
	.faq-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.8rem; }
	.faq-links a { padding: 0.3rem 0.85rem; border-radius: 999px; border: 1.5px solid var(--line-strong); font-family: var(--font-display); font-size: 0.95rem; font-weight: 600; line-height: 1.3; color: var(--fg); transition: border-color .2s ease, color .2s ease; }
	.faq-links a:hover { border-color: var(--accent); color: var(--accent); }

	@media (prefers-reduced-motion: reduce) {
		.plus, .plus::before, .plus::after, summary h2 { transition: none; }
		.faq-item::details-content { transition: none; }
	}
</style>
