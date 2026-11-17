<script lang="ts">
	import Badge from './Badge.svelte';
	import { site } from '$lib/site';
	import type { TeamLead } from '$lib/site/build';
	const { work } = site();
	const teams = work.subteams.items;
	const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
	const leadList = (leads: TeamLead[]) => andList(leads.map((l) => (l.title ? `${l.name} (${l.title})` : l.name)));
</script>

<!-- One card per team; /teams/#team-<k> (older links to a team) lands on its card. -->
<ul class="cards" role="list" data-stagger>
	{#each teams as t (t.k)}
		<li id="team-{t.k}" class="card team scroll-mt-24" data-reveal>
			<a href="/teams/{t.k}/" class="name">
				<span class="ring"><Badge size={40} prop={t.k} sticker={false} /></span>
				<span class="min-w-0">{t.name}</span>
				<span class="go" aria-hidden="true">→</span>
			</a>
			{#if t.heads.length}<p class="people">{t.heads.length > 1 ? 'Heads' : 'Head'}: {andList(t.heads)}</p>{/if}
			{#if t.leads.length}<p class="people">{t.leads.length > 1 ? 'Leads' : 'Lead'}: {leadList(t.leads)}</p>{/if}
			<p class="line">{t.line}</p>
			{#if t.goals.length}
				<p class="goals-label">{work.subteams.goalsLabel}</p>
				<ul class="goals">
					{#each t.goals as g, i (i)}<li>{g}</li>{/each}
				</ul>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.cards { display: grid; gap: 0.85rem; list-style: none; padding: 0; }
	@media (min-width: 860px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	.team { min-width: 0; padding: 1.4rem 1.5rem 1.5rem; }
	.name {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--fg);
	}
	.name:hover, .name:focus-visible { color: var(--accent); }
	.go { margin-left: auto; color: var(--accent); transition: transform 0.2s ease; }
	.name:hover .go, .name:focus-visible .go { transform: translateX(3px); }
	.ring { display: grid; place-items: center; flex: none; width: 52px; height: 52px; border-radius: 999px; background: var(--surface-2); border: 1.5px solid var(--line-strong); }
	.people { margin-top: 0.55rem; font-size: 0.95rem; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
	.name + .people { margin-top: 0.9rem; }
	.line { margin-top: 0.75rem; font-size: 1rem; line-height: 1.55; color: var(--fg); }
	.goals-label { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--line); font-family: var(--font-display); font-size: 0.95rem; font-weight: 700; color: var(--muted); }
	.goals { display: grid; gap: 0.55rem; margin-top: 0.6rem; padding-left: 1.15rem; list-style: disc; }
	.goals li { font-size: 0.98rem; line-height: 1.55; color: var(--muted); }
	.goals li::marker { color: var(--accent); }
	@media (prefers-reduced-motion: reduce) { .go { transition: none; } }
</style>
