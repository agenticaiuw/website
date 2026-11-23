<script lang="ts">
	import Meta from '$lib/components/Meta.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { site } from '$lib/site';
	import type { TeamLead } from '$lib/site/build';

	let { data } = $props();
	const { club, project, work, team: board, join, nav } = site();
	const t = $derived(work.subteams.items.find((x) => x.k === data.k)!);
	const others = $derived(work.subteams.items.filter((x) => x.k !== data.k));
	const teamsLabel = nav.find((n) => n.id === 'teams')?.label ?? 'Teams';
	/* A head who is on the board gets their office hours link. */
	const hours = (name: string) => board.members.find((m) => m.name === name)?.officeHours;
	const plural = (n: number, one: string) => (n > 1 ? `${one}s` : one);
	const lead = (l: TeamLead) => (l.title ? `${l.name}, ${l.title}` : l.name);
</script>

<Meta title="{t.name} · {club.name}" />

<!-- One slide: the team, its goals, its people and its code. -->
<section class="slide team-page">
	<div class="shell">
		<a href="/teams/" class="back">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
			{teamsLabel}
		</a>

		<header class="head" data-reveal>
			<span class="ring"><Badge size="100%" prop={t.k} sticker={false} /></span>
			<div class="min-w-0">
				<a href="/hive/" class="eyebrow accent project">{project.title}</a>
				<h1 class="slide-title">{t.name}</h1>
				<p class="line">{t.line}</p>
			</div>
		</header>

		<div class="body" class:solo={!t.goals.length} data-stagger>
			{#if t.goals.length}
				<div class="card goals" data-reveal>
					<h2>{work.subteams.goalsLabel}</h2>
					<ol>
						{#each t.goals as g, i (i)}
							<li><span class="index-numeral" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><p>{g}</p></li>
						{/each}
					</ol>
				</div>
			{/if}

			{#if t.heads.length || t.leads.length || t.code.length}
				<aside class="card people" data-reveal>
					{#if t.heads.length}
						<h2>{plural(t.heads.length, 'Head')}</h2>
						<ul>
							{#each t.heads as name (name)}
								{@const href = hours(name)}
								<li>
									<span class="name">{name}</span>
									{#if href && href !== '#'}
										<a {href} target="_blank" rel="noopener noreferrer" class="hours">
											{join.officeHoursCta} <span aria-hidden="true">↗</span><span class="sr-only"> with {name} (opens in a new tab)</span>
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if t.leads.length}
						<h2>{plural(t.leads.length, 'Lead')}</h2>
						<ul class="leads">
							{#each t.leads as l (l.name)}<li><span class="name">{lead(l)}</span></li>{/each}
						</ul>
					{/if}
					{#if t.code.length}
						<h2>{work.subteams.codeLabel}</h2>
						<ul class="code">
							{#each t.code as c (c.href)}
								<li>
									<a href={c.href} target="_blank" rel="noopener noreferrer">
										{c.label} <span aria-hidden="true">↗</span><span class="sr-only"> on GitHub (opens in a new tab)</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</aside>
			{/if}
		</div>

		<nav class="others" aria-label="Other teams" data-reveal>
			{#each others as o (o.k)}
				<a href="/teams/{o.k}/" class="other">
					<Badge size={30} prop={o.k} sticker={false} />
					<span>{o.short}</span>
				</a>
			{/each}
		</nav>
	</div>
</section>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--muted);
	}
	.back:hover, .back:focus-visible { color: var(--fg); }

	.head { display: flex; align-items: center; gap: clamp(1rem, 3vw, 1.75rem); margin-top: clamp(0.5rem, 1.4svh, 1.25rem); }
	.ring { display: grid; place-items: center; flex: none; width: clamp(80px, min(14vw, 15svh), 128px); aspect-ratio: 1; padding: 0.4rem; border-radius: 999px; background: var(--surface-2); border: 1.5px solid var(--line-strong); }
	.project { display: inline-block; }
	.project:hover, .project:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
	.slide-title { margin-top: 0.15rem; }
	.line { margin-top: clamp(0.35rem, 1.2svh, 0.6rem); max-width: 46rem; font-size: clamp(1rem, min(1.4vw, 2.5svh), 1.2rem); line-height: 1.55; color: var(--muted); }

	.body { display: grid; gap: 1rem; margin-top: clamp(1rem, 2.8svh, 2rem); }
	@media (min-width: 900px) {
		.body { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: stretch; }
		.body.solo { grid-template-columns: minmax(0, 28rem); }
	}
	.goals, .people { min-width: 0; padding: clamp(1.1rem, min(2.4vw, 3.4svh), 1.9rem); }
	.goals { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	h2 { font-family: var(--font-sans); font-size: clamp(1.2rem, min(1.9vw, 3.4svh), 1.6rem); font-weight: 800; letter-spacing: -0.02em; }
	.goals ol { display: grid; gap: clamp(0.6rem, 2svh, 1.1rem); margin-top: clamp(0.7rem, 2svh, 1.1rem); list-style: none; padding: 0; }
	.goals li { display: flex; align-items: baseline; gap: 0.85rem; min-width: 0; }
	.goals li .index-numeral { flex: none; width: auto; height: auto; border: 0; background: none; font-family: var(--font-sans); font-size: clamp(1.4rem, min(2.4vw, 4.2svh), 2rem); font-weight: 900; letter-spacing: -0.04em; }
	.goals li p { min-width: 0; font-size: clamp(1rem, min(1.35vw, 2.4svh), 1.15rem); line-height: 1.5; color: var(--fg); }

	.people h2 { font-size: 1.05rem; color: var(--muted); }
	.people h2:not(:first-child) { margin-top: clamp(0.7rem, 1.9svh, 1.25rem); padding-top: clamp(0.6rem, 1.7svh, 1.1rem); border-top: 1px solid var(--line); }
	.people ul { display: grid; gap: clamp(0.3rem, 1svh, 0.5rem) 1rem; margin-top: 0.55rem; list-style: none; padding: 0; }
	.people ul.leads { grid-template-columns: repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr)); }
	.people ul.code { display: flex; flex-wrap: wrap; gap: 0.35rem 1.1rem; }
	.people li { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 0.75rem; min-width: 0; }
	.name { min-width: 0; font-size: 1.02rem; line-height: 1.45; color: var(--fg); overflow-wrap: anywhere; }
	.hours, .code a { font-family: var(--font-display); font-weight: 600; color: var(--accent); }
	.hours:hover, .hours:focus-visible, .code a:hover, .code a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

	.others { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: clamp(0.9rem, 2.4svh, 2rem); }
	.other {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.85rem 0.3rem 0.4rem;
		border-radius: 999px;
		border: 1.5px solid var(--line-strong);
		background: var(--surface);
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--fg);
		transition: border-color 0.2s ease;
	}
	.other:hover, .other:focus-visible { border-color: var(--accent); }

	@media (max-width: 560px) {
		.head { flex-direction: column; align-items: flex-start; }
	}
</style>
