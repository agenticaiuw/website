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

<Meta title="{t.name} · {club.name}" description={t.line} />

<section class="team-page">
	<div class="shell">
		<a href="/teams/" class="back">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
			{teamsLabel}
		</a>

		<header class="head" data-reveal>
			<span class="ring"><Badge size={88} prop={t.k} sticker={false} /></span>
			<div class="min-w-0">
				<p class="eyebrow accent">{project.title}</p>
				<h1>{t.name}</h1>
				<p class="line">{t.line}</p>
			</div>
		</header>

		<div class="body" class:solo={!t.goals.length}>
			{#if t.goals.length}
				<div class="card goals" data-reveal>
					<h2>{work.subteams.goalsLabel}</h2>
					<ol>
						{#each t.goals as g, i (i)}
							<li><span class="index-numeral" aria-hidden="true">{i + 1}</span><p>{g}</p></li>
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
						<ul>
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

		<nav class="others" aria-label="Other teams">
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
	.team-page { padding: clamp(6.5rem, 11vw, 8.5rem) 0 clamp(4.5rem, 9vw, 7rem); }
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--muted);
	}
	.back:hover, .back:focus-visible { color: var(--fg); }

	.head { display: flex; align-items: center; gap: clamp(1rem, 3vw, 1.75rem); margin-top: 1.5rem; }
	.ring { display: grid; place-items: center; flex: none; width: clamp(88px, 14vw, 120px); aspect-ratio: 1; border-radius: 999px; background: var(--surface-2); border: 1.5px solid var(--line-strong); }
	h1 { margin-top: 0.15rem; font-size: clamp(2.3rem, 6vw, 4rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.03em; }
	.line { margin-top: 0.6rem; max-width: 42rem; font-size: 1.1rem; line-height: 1.6; color: var(--muted); }

	.body { display: grid; gap: 1rem; margin-top: clamp(2rem, 4vw, 2.75rem); }
	@media (min-width: 900px) {
		.body { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: start; }
		.body.solo { grid-template-columns: minmax(0, 28rem); }
	}
	.goals, .people { min-width: 0; padding: clamp(1.4rem, 3vw, 1.9rem); }
	.goals { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	h2 { font-size: 1.35rem; }
	.goals ol { display: grid; gap: 1rem; margin-top: 1.1rem; list-style: none; padding: 0; }
	.goals li { display: flex; align-items: flex-start; gap: 0.85rem; min-width: 0; }
	.goals li .index-numeral { flex: none; width: 2.2rem; height: 2.2rem; font-size: 0.95rem; }
	.goals li p { min-width: 0; font-size: 1.05rem; line-height: 1.55; color: var(--fg); }

	.people h2 { font-size: 1.05rem; color: var(--muted); }
	.people h2:not(:first-child) { margin-top: 1.25rem; padding-top: 1.1rem; border-top: 1px solid var(--line); }
	.people ul { display: grid; gap: 0.5rem; margin-top: 0.55rem; list-style: none; padding: 0; }
	.people li { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 0.75rem; min-width: 0; }
	.name { min-width: 0; font-size: 1.02rem; line-height: 1.45; color: var(--fg); overflow-wrap: anywhere; }
	.hours, .code a { font-family: var(--font-display); font-weight: 600; color: var(--accent); }
	.hours:hover, .hours:focus-visible, .code a:hover, .code a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

	.others { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: clamp(2.5rem, 5vw, 3.5rem); }
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
