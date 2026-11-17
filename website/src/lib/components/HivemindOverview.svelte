<script lang="ts">
	import { linesHtml, richHtml, safeHref, site } from '$lib/site';
	import TextColor from './ui/TextColor.svelte';
	import SignalWaves from './ui/SignalWaves.svelte';
	import TopoField from './ui/TopoField.svelte';
	import Badge from './Badge.svelte';
	const { project: p, why, details, beginner } = site();
	let mode = $state(0);
	const scenario = $derived(p.scenarios[Math.min(mode, p.scenarios.length - 1)]);
</script>

<div class="intro-grid">
	<div class="hero-atmosphere" aria-hidden="true"><SignalWaves /></div>
	<div class="intro" data-reveal>
		<p class="status"><span aria-hidden="true"></span>{p.status}</p>
		<h1>{p.title}<span class="title-dot">.</span></h1>
		<h2>{p.tagline}<br /><span class="accent">{p.taglineAccent}</span></h2>
		<p class="intro-copy">{p.intro}</p>
		<p class="access-note">{p.accessNote}</p>
		<div class="hero-actions">
			<a class="primary-link" href={safeHref(p.primaryHref)}>{p.primaryCta} <span aria-hidden="true">→</span></a>
			<a class="text-link" href={safeHref(p.secondaryHref)}>{p.secondaryCta} <span aria-hidden="true">↓</span></a>
		</div>
		<p class="welcome-note">{p.welcomeNote}</p>
	</div>

	{#if scenario}
	<figure class="journey" data-reveal>
		<figcaption class="journey-caption"><span class="eyebrow">{p.journeyEyebrow}</span><span class="concept-label">{p.journeyLabel}</span></figcaption>
		<div class="mode-switch" role="group" aria-label="Explore ways to use Hivemind">
			{#each p.scenarios as option, i}
				<button type="button" aria-pressed={mode === i} onclick={() => mode = i}>{option.label}</button>
			{/each}
		</div>
		<blockquote>{scenario.prompt}</blockquote>
		<div aria-live="polite" aria-atomic="true">
			<ol class="journey-steps">
				{#each [
					{ title: scenario.entry, detail: scenario.entryDetail },
					{ title: scenario.context, detail: scenario.contextDetail },
					{ title: scenario.action, detail: scenario.actionDetail },
					{ title: scenario.result, detail: scenario.resultDetail }
				] as step, i (i + step.title)}
					<li><span class="step-dot" aria-hidden="true"></span><div><h3>{step.title}</h3><p>{step.detail}</p></div></li>
				{/each}
			</ol>
		</div>
		<p class="diagram-note">{p.diagramNote}</p>
	</figure>
	{/if}
</div>

<section class="build-pair" aria-label="Hardware and software, built together" data-reveal>
	<article>
		<svg class="system-icon" viewBox="0 0 64 72" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M23 22 25 4h14l2 18M23 50l2 18h14l2-18"/><rect x="17" y="21" width="30" height="30" rx="12"/><path d="M24 33v6m4-10v14m4-17v20m4-15v10m4-7v4"/><path d="M48 31h3v10h-3"/></svg>
		<div><p class="eyebrow accent">{p.hardware.eyebrow}</p><h3>{p.hardware.title}</h3><p>{p.hardware.body}</p></div>
	</article>
	<article>
		<svg class="system-icon" viewBox="0 0 64 72" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="19" y="23" width="26" height="26" rx="7"/><circle cx="32" cy="36" r="5"/><path d="M32 10v13m0 26v13M7 36h12m26 0h12"/><circle cx="32" cy="7" r="3"/><circle cx="32" cy="65" r="3"/><circle cx="4" cy="36" r="3"/><circle cx="60" cy="36" r="3"/></svg>
		<div><p class="eyebrow accent">{p.software.eyebrow}</p><h3>{p.software.title}</h3><p>{p.software.body}</p></div>
	</article>
</section>

<section class="hermes-section" aria-labelledby="why-hivemind">
	<div class="comparison-atmosphere" aria-hidden="true"><TopoField strength={0.9} /></div>
	<div class="comparison-intro" data-reveal>
		<p class="eyebrow accent">{why.eyebrow}</p>
		<h2 id="why-hivemind">{@html linesHtml(why.heading)}</h2>
		<p class="why-thesis"><strong>{@html linesHtml(why.thesis)}</strong></p>
		<p class="why-intent">{why.intent}</p>
		<div class="context-path" aria-label="Planned context process">{#each why.path as step, i}{#if i}<span aria-hidden="true">↓</span>{/if}<span>{step}</span>{/each}</div>
	</div>
	<div class="hermes-copy" data-reveal>
		<div class="comparison-base"><p class="eyebrow">{why.base.eyebrow}</p><h3>{why.base.title}</h3><p>{why.base.body}</p></div>
		<div class="comparison-goal"><p class="eyebrow accent">{why.goal.eyebrow}</p><h3>{why.goal.title}</h3><p>{why.goal.body}</p></div>
		<p class="why-answer">{why.answer}</p>
		<a class="source-link" href={safeHref(why.sourceHref)} target="_blank" rel="noopener noreferrer">{why.sourceLabel} <span aria-hidden="true">↗</span></a>
	</div>
	<div class="engineering-goals">
		<div class="engineering-heading" data-reveal><p class="eyebrow accent">{why.goalsEyebrow}</p><p>{why.goalsLede}</p></div>
		<div class="engineering-grid">
			{#each why.goals as g, i (i)}
				<article data-reveal><span class="goal-verb">{g.verb}</span><h3>{g.title}</h3><p>{g.body}</p>{#if g.mechanism}<p class="goal-mechanism">{@html richHtml(g.mechanism)}</p>{/if}</article>
			{/each}
		</div>
		<p class="engineering-note">{why.note}</p>
		<details class="research-details">
			<summary><span><strong>{why.researchTitle}</strong><span>{why.researchSubtitle}</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid">
				{#each why.research as r, i (i)}
					<article><h3>{r.title}</h3><p>{r.body}</p><p class="research-limit">{r.limit}</p><a class="source-link" href={safeHref(r.linkHref)} target="_blank" rel="noopener noreferrer">{r.linkLabel} ↗</a></article>
				{/each}
			</div>
			<p class="research-date">{why.researchDate}</p>
		</details>
	</div>
</section>

<section class="details-section" aria-labelledby="under-the-hood">
	<div class="detail-heading" data-reveal><div><p class="eyebrow">{details.eyebrow}</p><h2 id="under-the-hood">{details.heading}</h2></div><p>{@html linesHtml(details.aside)}</p></div>
	<div class="disclosures" data-reveal>
		<details>
			<summary><span><strong>{details.architectureTitle}</strong><span>{details.architectureSubtitle}</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid">{#each details.architecture as item}<article><h3>{item.title}</h3><p class="detail-summary">{item.summary}</p><p>{item.body}</p></article>{/each}</div>
		</details>
		<details>
			<summary><span><strong>{details.buildTitle}</strong><span>{details.buildSubtitle}</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid build-areas">{#each details.buildAreas as item, i (i)}<article><h3>{item.name}</h3><p>{item.detail}</p></article>{/each}</div>
		</details>
		<details>
			<summary><span><strong>{details.prioritiesTitle}</strong><span>{details.prioritiesSubtitle}</span></span><span class="expand-icon" aria-hidden="true">+</span></summary>
			<div class="detail-grid priorities">{#each details.priorities as item}<article><h3>{item.question}</h3><p>{item.answer}</p></article>{/each}</div>
		</details>
	</div>
	<p class="project-status">{details.status}</p>
</section>

<section class="beginner" aria-labelledby="beginner-hivemind" data-reveal>
	<div class="beginner-badge" aria-hidden="true"><Badge size="100%" wave mood="happy" /></div>
	<div><p class="eyebrow accent">{beginner.eyebrow}</p><h2 id="beginner-hivemind"><TextColor words={beginner.words} /></h2><p>{@html richHtml(beginner.body)}</p><a class="primary-link" href={safeHref(beginner.ctaHref)}>{beginner.cta} <span aria-hidden="true">→</span></a></div>
	<div class="support-list">
		{#each beginner.support as item, i (i)}
			<div><h3>{item.title}</h3><p>{@html richHtml(item.body)}</p></div>
		{/each}
	</div>
</section>

<style>
	.intro-grid { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: clamp(2rem, 5vw, 4.5rem); align-items: center; }
	.hero-atmosphere { position: absolute; inset: -5rem -7vw -3.5rem; pointer-events: none; z-index: -1; opacity: .7; mask-image: linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent), linear-gradient(to right, transparent, #000 12%, #000 88%, transparent); mask-composite: intersect; }
	.intro { position: relative; isolation: isolate; }
	.intro::before { content: ''; position: absolute; inset: -1rem -2rem; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 30% 53%, color-mix(in srgb, var(--bg) 82%, transparent) 22%, transparent 72%); }
	.status { display: inline-flex; align-items: center; gap: .5rem; padding: .3rem .85rem; border-radius: 999px; border: 1.5px solid var(--line-strong); background: var(--surface-2); font-family: var(--font-display); font-size: .9rem; font-weight: 600; line-height: 1.35; color: var(--fg); }
	.status > span { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 3px rgb(240 180 58 / .2); flex-shrink: 0; }
	h1 { font-size: clamp(3.6rem, 8vw, 6.2rem); font-weight: 800; line-height: 1.02; letter-spacing: -.035em; margin: 1rem 0 1rem; }
	.title-dot { color: var(--accent); }
	.intro h2 { font-size: clamp(1.7rem, 2.9vw, 2.4rem); line-height: 1.15; max-width: 30rem; }
	.intro-copy { color: var(--muted); margin-top: 1.1rem; font-size: 1.05rem; line-height: 1.7; max-width: 32rem; }
	.access-note { max-width: 30rem; margin-top: .8rem; color: var(--muted); font-size: .95rem; line-height: 1.6; }
	.hero-actions { display: flex; gap: .75rem 1.25rem; align-items: center; flex-wrap: wrap; margin-top: 1.75rem; }
	.primary-link { display: inline-flex; gap: .6rem; align-items: center; min-height: 3rem; padding: .7rem 1.4rem; background: var(--red); color: #fff; border-radius: 999px; font-family: var(--font-display); font-size: 1.02rem; font-weight: 700; line-height: 1.2; box-shadow: 0 10px 24px -12px rgb(209 18 27 / .9); transition: transform .25s var(--ease-spring), background-color .2s ease; }
	.primary-link:hover { transform: translateY(-2px); background: var(--red-hover); }
	.text-link { display: inline-flex; gap: .5rem; font-family: var(--font-display); font-size: 1.02rem; font-weight: 600; }
	.text-link:hover, .source-link:hover { text-decoration: underline; text-underline-offset: 4px; }
	.welcome-note { color: var(--muted); font-size: .95rem; margin-top: 1rem; max-width: 30rem; }

	.journey { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: clamp(1.25rem, 2.8vw, 2rem); box-shadow: var(--shadow-lift); min-width: 0; }
	.journey-caption { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem; }
	.journey-caption .eyebrow { font-size: 1rem; color: var(--fg); }
	.concept-label { padding: .15rem .7rem; border-radius: 999px; background: var(--gold-surface); border: 1.5px solid #57441d; font-family: var(--font-display); font-size: .85rem; font-weight: 600; line-height: 1.35; color: var(--gold); }
	.mode-switch { display: flex; flex-wrap: wrap; padding: 4px; border: 1px solid var(--line); border-radius: 999px; margin-top: 1.25rem; gap: 4px; background: var(--bg); }
	.mode-switch button { flex: 1 1 auto; min-height: 2.5rem; padding: .45rem .9rem; border-radius: 999px; font-family: var(--font-display); font-size: .95rem; font-weight: 600; line-height: 1.25; color: var(--muted); transition: background .2s, color .2s; }
	.mode-switch button:hover { color: var(--fg); }
	.mode-switch button[aria-pressed='true'] { background: var(--cream); color: var(--ink); }
	blockquote { position: relative; font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; line-height: 1.35; margin: 1.25rem 0 1.4rem; padding: 1rem 1.15rem; border-radius: var(--r) var(--r) var(--r) 6px; background: var(--surface-2); max-width: 26rem; }
	.journey-steps { list-style: none; padding: 0; }
	.journey-steps li { position: relative; display: flex; gap: .9rem; padding-bottom: 1rem; }
	.journey-steps li:not(:last-child)::before { content: ''; position: absolute; left: 14px; top: 20px; bottom: -6px; width: 2px; border-radius: 2px; background: var(--line-strong); }
	.journey-steps li:last-child { padding-bottom: 0; }
	.step-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; }
	.step-dot::after { content: ''; width: 14px; height: 14px; border: 2.5px solid var(--line-strong); border-radius: 50%; background: var(--surface); }
	.journey-steps li:last-child .step-dot::after { border-color: var(--accent); background: var(--accent); }
	.journey-steps h3 { font-size: 1.1rem; line-height: 1.3; margin-top: 2px; }
	.journey-steps p { font-size: .95rem; color: var(--muted); line-height: 1.55; margin-top: .15rem; }
	.diagram-note { border-top: 1px solid var(--line); margin-top: 1.1rem; padding-top: .85rem; color: var(--muted); font-size: .9rem; line-height: 1.55; }

	.build-pair { margin-top: 3.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; }
	.build-pair article { display: flex; align-items: start; gap: 1.25rem; padding: 1.6rem; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow); min-width: 0; }
	.system-icon { width: 52px; height: 60px; flex-shrink: 0; padding: 8px; border-radius: 16px; background: var(--accent-surface); color: var(--accent); }
	.build-pair .eyebrow { font-size: .95rem; }
	.build-pair h3 { font-size: 1.35rem; line-height: 1.25; margin-top: .35rem; }
	.build-pair p:not(.eyebrow) { font-size: 1rem; line-height: 1.6; color: var(--muted); margin-top: .5rem; }
	.accent { color: var(--accent); }

	.hermes-section { position: relative; isolation: isolate; margin-top: 5.5rem; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 4rem; row-gap: 3rem; padding: 3.5rem 0 1rem; }
	.comparison-atmosphere { position: absolute; inset: -1rem -8vw; z-index: -1; pointer-events: none; opacity: .55; mask-image: linear-gradient(to bottom, transparent, #000 15%, #000 85%, transparent), linear-gradient(to right, transparent, #000 12%, #000 88%, transparent); mask-composite: intersect; }
	.comparison-atmosphere::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 27% 32%, color-mix(in srgb, var(--bg) 94%, transparent) 12%, transparent 48%), radial-gradient(ellipse at 74% 61%, color-mix(in srgb, var(--bg) 86%, transparent), transparent 38%); }
	.hermes-section h2 { margin-top: .5rem; font-size: clamp(2rem, 3.8vw, 2.9rem); line-height: 1.1; }
	.comparison-intro { position: relative; isolation: isolate; }
	.comparison-intro::before { content: ''; position: absolute; inset: -.5rem -1.2rem; z-index: -1; pointer-events: none; background: var(--bg); opacity: .8; filter: blur(24px); }
	.why-thesis { margin-top: 1.25rem; max-width: 26rem; font-family: var(--font-display); font-size: clamp(1.5rem, 2.6vw, 2rem); line-height: 1.25; }
	.why-thesis strong { color: var(--accent); font-weight: 700; }
	.why-intent { margin-top: .8rem; font-size: 1.02rem; line-height: 1.65; color: var(--muted); max-width: 26rem; }
	.context-path { display: inline-flex; flex-direction: column; align-items: start; gap: .3rem; margin-top: 1.5rem; padding: 1rem 1.2rem; border-radius: var(--r); background: var(--surface); border: 1px solid var(--line); font-family: var(--font-display); font-size: 1rem; font-weight: 600; line-height: 1.35; }
	.context-path [aria-hidden] { color: var(--accent); font-size: .95rem; }
	.hermes-copy { font-size: 1rem; color: var(--muted); line-height: 1.65; min-width: 0; }
	.comparison-base { padding: 1.35rem; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); margin-bottom: .75rem; }
	.comparison-goal { border: 1px solid var(--accent-border); background: linear-gradient(140deg, var(--accent-surface), var(--surface) 80%); border-radius: var(--r-lg); padding: 1.35rem; }
	.hermes-copy .eyebrow { font-size: .95rem; }
	.hermes-copy h3 { color: var(--fg); font-size: 1.3rem; margin: .35rem 0 .45rem; }
	.hermes-copy .why-answer { margin-top: 1rem; font-size: 1rem; }
	.source-link { display: inline-flex; gap: .5rem; color: var(--accent); font-weight: 600; font-size: .95rem; margin-top: .9rem; }

	.engineering-goals { grid-column: 1 / -1; }
	.engineering-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .4rem 1rem; align-items: baseline; margin-bottom: 1.25rem; }
	.engineering-heading .eyebrow { font-size: 1.05rem; }
	.engineering-heading > p:last-child { font-size: .95rem; color: var(--muted); }
	.engineering-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .85rem; }
	.engineering-grid article { background: var(--surface); padding: 1.5rem; border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow); min-width: 0; }
	.goal-verb { display: inline-flex; padding: .2rem .75rem; border-radius: 999px; background: var(--red); color: #fff; font-family: var(--font-display); font-size: .9rem; font-weight: 700; line-height: 1.35; }
	.engineering-grid h3 { margin-top: .85rem; font-size: 1.3rem; line-height: 1.25; }
	.engineering-grid p { margin-top: .6rem; font-size: .98rem; line-height: 1.6; color: var(--muted); }
	.engineering-grid .goal-mechanism { border-top: 1px solid var(--line); padding-top: .75rem; font-size: .92rem; line-height: 1.55; }
	.goal-mechanism :global(strong) { color: var(--fg); font-weight: 600; }
	.engineering-note { margin-top: 1rem; max-width: 58rem; color: var(--muted); font-size: .92rem; line-height: 1.6; }

	.research-details { margin-top: 1.25rem; }
	.research-details summary strong { font-size: 1.1rem; }
	.research-details .research-limit, .research-date { color: var(--muted); font-size: .92rem; line-height: 1.6; }
	.research-date { padding: 0 1.25rem 1.25rem; max-width: 57rem; }

	.details-section { margin-top: 4.5rem; }
	.detail-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
	.detail-heading h2 { font-size: clamp(1.9rem, 3.4vw, 2.5rem); margin-top: .35rem; }
	.detail-heading > p { font-size: .95rem; color: var(--muted); text-align: right; }
	.disclosures { display: grid; gap: .75rem; margin-top: 1.5rem; }
	details { border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); transition: border-color .2s ease; }
	details[open] { border-color: var(--line-strong); }
	summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.15rem 1.25rem; list-style: none; border-radius: var(--r-lg); }
	summary::-webkit-details-marker { display: none; }
	summary strong { display: block; font-family: var(--font-display); font-size: 1.2rem; font-weight: 700; line-height: 1.3; }
	summary > span > span { display: block; margin-top: .1rem; font-size: .95rem; color: var(--muted); }
	.expand-icon { display: grid; place-items: center; flex-shrink: 0; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: var(--surface-2); font-size: 1.4rem; line-height: 1; color: var(--fg); transition: transform .25s var(--ease-spring), background-color .2s ease; }
	summary:hover .expand-icon { background: var(--raised); }
	details[open] .expand-icon { transform: rotate(45deg); background: var(--red); color: #fff; }
	.detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem 2.5rem; padding: .5rem 1.25rem 1.5rem; }
	.detail-grid h3 { font-size: 1.15rem; line-height: 1.3; }
	.detail-grid p { color: var(--muted); font-size: .98rem; line-height: 1.65; margin-top: .45rem; }
	.detail-grid .detail-summary { color: var(--fg); font-weight: 600; margin-top: .3rem; }
	.build-areas h3 { margin-top: .2rem; }
	.priorities { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; }
	.project-status { max-width: 52rem; font-size: .95rem; line-height: 1.6; color: var(--muted); margin-top: 1.25rem; }

	.beginner { position: relative; margin-top: 4.5rem; padding: clamp(1.5rem, 4vw, 3rem); padding-top: clamp(2rem, 4vw, 3rem); background: linear-gradient(130deg, #3a1714, var(--surface) 70%); border: 1px solid var(--accent-border); border-radius: calc(var(--r-lg) + 6px); display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 3rem; box-shadow: var(--shadow-lift); }
	.beginner-badge { position: absolute; top: -3.25rem; right: clamp(1rem, 4vw, 3rem); width: 7.5rem; transform: rotate(8deg); }
	.beginner h2 { font-size: clamp(2.1rem, 4vw, 3.1rem); margin-top: .6rem; }
	.beginner p:not(.eyebrow) { color: var(--muted); font-size: 1.02rem; line-height: 1.65; margin-top: 1rem; }
	.beginner .eyebrow { font-size: 1.05rem; }
	.beginner :global(strong) { color: var(--fg); font-weight: 600; }
	.beginner .primary-link { margin-top: 1.4rem; }
	.support-list { display: grid; gap: .75rem; align-content: center; }
	.support-list > div { padding: 1.1rem 1.25rem; border-radius: var(--r); background: rgb(0 0 0 / .22); border: 1px solid var(--line); }
	.support-list h3 { font-size: 1.15rem; }
	.beginner .support-list p:not(.eyebrow) { font-size: .95rem; margin-top: .25rem; }
	.support-list :global(a) { color: var(--fg); text-decoration: underline; text-underline-offset: 3px; }

	@media (max-width: 900px) {
		.intro-grid { gap: 2rem; }
		.hero-actions { gap: .75rem 1rem; }
		.hermes-section { column-gap: 2rem; }
		.beginner { gap: 2rem; }
	}
	@media (max-width: 760px) {
		.intro-grid, .hermes-section, .beginner, .build-pair, .engineering-grid { grid-template-columns: minmax(0, 1fr); }
		.build-pair { margin-top: 2.5rem; }
		.build-pair article { padding: 1.3rem; gap: 1rem; }
		.engineering-heading { flex-direction: column; gap: .3rem; }
		.intro-grid { gap: 2.25rem; }
		.hero-atmosphere { inset: -2rem -1.25rem 0; opacity: .55; }
		h1 { font-size: clamp(3.2rem, 15vw, 4.6rem); }
		.intro h2 { font-size: clamp(1.5rem, 6.6vw, 2rem); }
		.hermes-section { margin-top: 3.5rem; padding-top: 2rem; }
		.hermes-section h2 :global(br) { display: none; }
		.detail-heading > p { display: none; }
		.detail-grid, .priorities { grid-template-columns: minmax(0, 1fr); gap: 1.25rem; }
		.beginner { margin-top: 5rem; gap: 1.75rem; padding-top: 3.75rem; }
		.beginner-badge { width: 6rem; top: -3rem; }
		.beginner h2 { font-size: clamp(1.9rem, 8vw, 2.6rem); }
		.mode-switch { border-radius: var(--r); }
	}
</style>
