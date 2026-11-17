<script lang="ts">
	import { richHtml, site } from '$lib/site';
	const { story } = site();
</script>

<!-- Home page, under the press card: why the club exists, in short headed paragraphs. -->
{#if story.parts.length}
	<section id="why-we-exist" class="story scroll-mt-20" aria-labelledby="story-heading">
		<div class="shell">
			<h2 id="story-heading" data-reveal>{story.heading}</h2>

			<div class="parts">
				{#each story.parts as p, i (i)}
					<article class="part" data-reveal>
						<h3>{p.title}</h3>
						<div class="text">
							<p>{@html richHtml(p.body)}</p>
							{#if p.points.length}
								<ul>
									{#each p.points as point, j (j)}<li>{point}</li>{/each}
								</ul>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>
{/if}

<style>
	.story { padding: clamp(4.5rem, 9vw, 7rem) 0 0; }
	h2 { font-size: clamp(2rem, 4.4vw, 3.1rem); }

	.parts { margin-top: clamp(1.75rem, 4vw, 2.5rem); }
	.part { display: grid; gap: 0.6rem; min-width: 0; padding: clamp(1.4rem, 3vw, 2rem) 0; border-top: 1px solid var(--line); }
	@media (min-width: 900px) {
		.part { grid-template-columns: minmax(0, 19rem) minmax(0, 1fr); gap: 3rem; }
	}
	h3 { font-size: clamp(1.3rem, 2.2vw, 1.55rem); line-height: 1.25; }

	.text { min-width: 0; max-width: 44rem; }
	.text p { font-size: 1.08rem; line-height: 1.7; color: var(--muted); }
	.text :global(a) { color: var(--accent); font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
	.text :global(a:hover), .text :global(a:focus-visible) { text-decoration-thickness: 2px; }
	.text ul { display: grid; gap: 0.55rem; margin-top: 0.9rem; padding-left: 1.2rem; list-style: disc; }
	.text li { font-size: 1.05rem; line-height: 1.6; color: var(--fg); }
	.text li::marker { color: var(--accent); }
</style>
