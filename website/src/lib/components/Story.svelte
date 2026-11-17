<script lang="ts">
	import { site } from '$lib/site';
	const { story } = site();
	const { then, now, students, problems, beyond } = story;
</script>

<!-- Home page, under the press card: why the club exists, from the 10/29 club-wide meeting. -->
<section id="why-we-exist" class="story scroll-mt-20" aria-labelledby="story-heading">
	<div class="shell">
		<h2 id="story-heading" data-reveal>{story.heading}</h2>

		<div class="eras" data-stagger>
			<article class="card era" data-reveal>
				<span class="tag-pill">{then.label}</span>
				<h3>{then.heading}</h3>
				<figure class="quote">
					<blockquote><p>“{then.quote}”</p></blockquote>
					<figcaption>{then.quoteBy}</figcaption>
				</figure>
				<p class="body">{then.body}</p>
				<ul class="shifts" role="list">
					{#each then.shifts as s, i (i)}
						<li><span class="from">{s.from}</span><span class="arrow" aria-hidden="true">→</span><span class="sr-only"> to </span><span class="to">{s.to}</span></li>
					{/each}
				</ul>
			</article>

			<article class="card era now" data-reveal>
				<span class="tag-pill red">{now.label}</span>
				<h3>{now.heading}</h3>
				<figure class="quote">
					<blockquote>
						<ul role="list">
							{#each now.points as p, i (i)}<li>{p}</li>{/each}
						</ul>
					</blockquote>
					<figcaption>
						{#if now.quoteHref && now.quoteHref !== '#'}
							<a href={now.quoteHref} target="_blank" rel="noopener noreferrer">{now.quoteBy} <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>
						{:else}{now.quoteBy}{/if}
					</figcaption>
				</figure>
				{#if now.note}<p class="body">{now.note}</p>{/if}
			</article>
		</div>

		<figure class="card students" data-reveal>
			<p class="eyebrow accent">{students.label}</p>
			<blockquote><p class="big">{students.quote}</p></blockquote>
			<dl class="ages">
				{#each students.people as p (p.name)}
					<div class="age">
						<dt>{p.name}</dt>
						<dd>{p.age}</dd>
					</div>
				{/each}
			</dl>
			{#if students.peopleNote}<figcaption class="note">{students.peopleNote}</figcaption>{/if}
		</figure>

		<div class="aims" data-stagger>
			<article class="card aim first" data-reveal>
				<h3>{problems.label}</h3>
				<p class="body">{problems.body}</p>
				<ol class="problems" role="list">
					{#each problems.items as q, i (i)}<li><span class="index-numeral" aria-hidden="true">{i + 1}</span><span>{q}</span></li>{/each}
				</ol>
			</article>
			{#each beyond as b (b.title)}
				<article class="card aim" data-reveal>
					<h3>{b.title}</h3>
					<ul class="points">
						{#each b.points as p, i (i)}<li>{p}</li>{/each}
					</ul>
				</article>
			{/each}
		</div>
	</div>
</section>

<style>
	.story { padding: clamp(4.5rem, 9vw, 7rem) 0 0; }
	h2 { font-size: clamp(2rem, 4.4vw, 3.1rem); }
	h3 { font-size: 1.4rem; line-height: 1.2; }
	.body { font-size: 1rem; line-height: 1.6; color: var(--muted); }

	/* ---------- then and now ---------- */
	.eras { display: grid; gap: 1rem; margin-top: clamp(2rem, 4vw, 2.75rem); }
	@media (min-width: 900px) { .eras { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	.era { display: flex; flex-direction: column; align-items: flex-start; gap: 0.9rem; min-width: 0; padding: clamp(1.4rem, 3vw, 1.9rem); }
	.era.now { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }

	.quote { width: 100%; padding-left: 1rem; border-left: 3px solid var(--accent); }
	.quote blockquote p, .quote li { font-family: var(--font-display); font-size: 1.2rem; font-weight: 600; line-height: 1.35; color: var(--fg); }
	.quote ul { display: grid; gap: 0.5rem; list-style: none; padding: 0; }
	.quote figcaption { margin-top: 0.55rem; font-size: 0.92rem; line-height: 1.45; color: var(--muted); }
	.quote figcaption a { color: var(--accent); font-weight: 600; }
	.quote figcaption a:hover, .quote figcaption a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

	.shifts { display: grid; gap: 0.45rem; width: 100%; list-style: none; padding: 0; }
	.shifts li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.5rem;
		padding: 0.55rem 0.8rem;
		border-radius: var(--r-sm);
		background: var(--surface-2);
		font-size: 0.98rem;
		line-height: 1.4;
	}
	.from { color: var(--muted); }
	.arrow { color: var(--accent); }
	.to { font-weight: 600; color: var(--fg); }

	/* ---------- students ---------- */
	.students { margin-top: 1rem; padding: clamp(1.5rem, 3.5vw, 2.4rem); }
	.big {
		margin-top: 0.6rem;
		max-width: 50rem;
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 2.8vw, 2.1rem);
		font-weight: 700;
		line-height: 1.25;
		letter-spacing: -0.01em;
		color: var(--fg);
	}
	.ages { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-top: clamp(1.4rem, 3vw, 2rem); }
	.age {
		display: flex;
		flex-direction: column-reverse;
		justify-content: flex-end;
		min-width: 0;
		padding: 1rem 1.15rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
	}
	.age dt { margin-top: 0.2rem; font-size: 0.95rem; line-height: 1.35; color: var(--muted); }
	.age dd { font-family: var(--font-display); font-size: clamp(2rem, 4.4vw, 2.75rem); font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--fg); }
	.note { margin-top: 0.8rem; font-size: 0.92rem; color: var(--muted); }
	@media (max-width: 700px) { .ages { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

	/* ---------- what we work on, and beyond the project ---------- */
	.aims { display: grid; gap: 1rem; margin-top: 1rem; }
	@media (min-width: 768px) { .aims { grid-template-columns: repeat(2, minmax(0, 1fr)); } .aim.first { grid-column: 1 / -1; } }
	@media (min-width: 1100px) { .aims { grid-template-columns: repeat(3, minmax(0, 1fr)); } .aim.first { grid-column: auto; } }
	.aim { display: flex; flex-direction: column; gap: 0.8rem; min-width: 0; padding: clamp(1.4rem, 3vw, 1.75rem); }
	.problems { display: grid; gap: 0.7rem; list-style: none; padding: 0; }
	.problems li { display: flex; align-items: flex-start; gap: 0.75rem; font-size: 1rem; line-height: 1.5; color: var(--fg); }
	.problems .index-numeral { flex: none; width: 2rem; height: 2rem; font-size: 0.9rem; }
	.points { display: grid; gap: 0.6rem; padding-left: 1.15rem; list-style: disc; }
	.points li { font-size: 1rem; line-height: 1.55; color: var(--muted); }
	.points li::marker { color: var(--accent); }
</style>
