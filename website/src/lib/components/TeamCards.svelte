<script lang="ts">
	import { onMount } from 'svelte';
	import Badge from './Badge.svelte';
	import { site } from '$lib/site';
	import type { TeamLead } from '$lib/site/build';
	const { work } = site();
	const teams = work.subteams.items;
	const andList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
	const leadList = (leads: TeamLead[]) => andList(leads.map((l) => (l.title ? `${l.name} (${l.title})` : l.name)));

	/* Every team is listed; the one picked shows in full beside the list.
	   Without JavaScript every team shows, one after another. */
	let active = $state(0);
	let tabs: HTMLButtonElement[] = $state([]);
	const pick = (i: number, focus = false) => {
		active = (i + teams.length) % teams.length;
		if (focus) tabs[active]?.focus();
	};
	const onKey = (e: KeyboardEvent, i: number) => {
		const keys: Record<string, number> = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: teams.length - 1 };
		if (!(e.key in keys)) return;
		e.preventDefault();
		pick(keys[e.key], true);
	};
	/* /teams/#team-<k> (older links to a team) opens on that team. */
	onMount(() => {
		const i = teams.findIndex((t) => `#team-${t.k}` === location.hash);
		if (i >= 0) pick(i);
	});
</script>

<div class="explorer" data-reveal>
	<div class="tabs" role="tablist" aria-label={work.subteams.heading} aria-orientation="vertical">
		{#each teams as t, i (t.k)}
			<button
				type="button"
				role="tab"
				id="tab-{t.k}"
				class="tab"
				aria-selected={active === i}
				aria-controls="team-{t.k}"
				tabindex={active === i ? 0 : -1}
				bind:this={tabs[i]}
				onclick={() => pick(i)}
				onkeydown={(e) => onKey(e, i)}
			>
				<span class="ring"><Badge size="100%" prop={t.k} sticker={false} /></span>
				<span class="tab-name">{t.short}</span>
			</button>
		{/each}
	</div>

	{#each teams as t, i (t.k)}
		<div id="team-{t.k}" class="card panel scroll-mt-24" class:off={active !== i} role="tabpanel" aria-labelledby="tab-{t.k}" tabindex="0">
			<a href="/teams/{t.k}/" class="name">
				<span class="min-w-0">{t.name}</span>
				<span class="go" aria-hidden="true">→</span>
			</a>
			<div class="cols" class:solo={!t.goals.length}>
				<div class="about">
					<p class="line">{t.line}</p>
					{#if t.heads.length}<p class="people"><span class="who">{t.heads.length > 1 ? 'Heads' : 'Head'}</span> {andList(t.heads)}</p>{/if}
					{#if t.leads.length}<p class="people"><span class="who">{t.leads.length > 1 ? 'Leads' : 'Lead'}</span> {leadList(t.leads)}</p>{/if}
				</div>
				{#if t.goals.length}
					<div class="goals-box">
						<p class="goals-label">{work.subteams.goalsLabel}</p>
						<ol class="goals">
							{#each t.goals as g, n (n)}
								<li><span class="num" aria-hidden="true">{String(n + 1).padStart(2, '0')}</span><span>{g}</span></li>
							{/each}
						</ol>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.explorer { display: grid; gap: clamp(0.75rem, 2svh, 1.25rem); }
	/* list on the left, the picked team on the right (with JS; without it, all stack) */
	@media (min-width: 900px) {
		:global(.js) .explorer { grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr); align-items: start; }
		:global(.js) .panel { grid-column: 2; grid-row: 1; }
	}

	/* ---- the list of teams ---- */
	.tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
	@media (min-width: 900px) { .tabs { grid-template-columns: minmax(0, 1fr); gap: clamp(0.35rem, 1svh, 0.6rem); } }
	.tab {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		padding: clamp(0.3rem, 0.9svh, 0.5rem) 0.9rem clamp(0.3rem, 0.9svh, 0.5rem) clamp(0.3rem, 0.9svh, 0.5rem);
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--surface);
		color: var(--muted);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
	}
	.tab:hover { border-color: var(--line-strong); color: var(--fg); }
	.tab[aria-selected='true'] { border-color: var(--accent); background: var(--accent-surface); color: var(--fg); }
	.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	.ring { display: grid; place-items: center; flex: none; width: clamp(2.1rem, min(3.4vw, 5svh), 2.9rem); aspect-ratio: 1; padding: 0.15rem; border-radius: 999px; background: var(--surface-2); border: 1.5px solid var(--line-strong); }
	.tab-name { min-width: 0; font-family: var(--font-sans); font-size: clamp(0.95rem, min(1.35vw, 2.4svh), 1.15rem); font-weight: 700; line-height: 1.2; overflow-wrap: break-word; }
	@media (max-width: 899px) {
		.tab { flex-direction: column; gap: 0.35rem; padding: 0.55rem 0.35rem; border-radius: var(--r-lg); text-align: center; }
		.tab-name { font-size: 0.92rem; }
	}
	/* phones: the teams sit in one row that scrolls sideways, edge to edge */
	@media (max-width: 640px) {
		.tabs {
			display: flex;
			gap: 0.45rem;
			margin-inline: calc(-1 * clamp(1.25rem, 5vw, 4rem));
			padding: 0.2rem clamp(1.25rem, 5vw, 4rem) 0.35rem;
			overflow-x: auto;
			scroll-padding-inline: clamp(1.25rem, 5vw, 4rem);
			scrollbar-width: none;
		}
		.tabs::-webkit-scrollbar { display: none; }
		.tab { flex: none; flex-direction: row; gap: 0.5rem; padding: 0.3rem 0.85rem 0.3rem 0.3rem; border-radius: 999px; text-align: left; }
		.ring { width: 2.1rem; }
	}

	/* ---- the picked team ---- */
	.panel { min-width: 0; padding: clamp(1.25rem, min(2.8vw, 4svh), 2.25rem); background: linear-gradient(140deg, var(--accent-surface), var(--surface) 60%); border-color: var(--accent-border); }
	.panel:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
	:global(.js) .panel.off { display: none; }
	:global(.js) .panel:not(.off) { animation: swap 0.45s var(--ease-out-expo); }
	@keyframes swap {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: none; }
	}
	.panel + .panel { margin-top: 0.75rem; }
	:global(.js) .panel + .panel { margin-top: 0; }

	.name {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		font-family: var(--font-sans);
		font-size: clamp(1.6rem, min(3vw, 5.4svh), 2.75rem);
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.03em;
		color: var(--fg);
	}
	.name:hover, .name:focus-visible { color: var(--accent); }
	.go { color: var(--accent); transition: transform 0.2s ease; }
	.name:hover .go, .name:focus-visible .go { transform: translateX(4px); }

	.cols { display: grid; gap: clamp(1rem, 3svh, 1.75rem) clamp(1.5rem, 3vw, 2.75rem); margin-top: clamp(0.9rem, 2.8svh, 1.6rem); }
	@media (min-width: 900px) { .cols:not(.solo) { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); } }
	.line { font-size: clamp(1.02rem, min(1.4vw, 2.5svh), 1.2rem); line-height: 1.55; color: var(--fg); }
	.people { margin-top: clamp(0.6rem, 1.8svh, 0.9rem); font-size: 0.98rem; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
	.who { display: block; font-family: var(--font-sans); font-size: 0.8rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }

	.goals-label { font-family: var(--font-sans); font-size: 0.8rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); }
	.goals { display: grid; gap: clamp(0.6rem, 1.8svh, 0.95rem); margin-top: 0.6rem; list-style: none; padding: 0; }
	.goals li { display: flex; align-items: baseline; gap: 0.8rem; min-width: 0; font-size: clamp(0.98rem, min(1.25vw, 2.3svh), 1.08rem); line-height: 1.5; color: var(--fg); }
	.num { flex: none; font-family: var(--font-sans); font-size: 1.2rem; font-weight: 900; letter-spacing: -0.04em; color: var(--accent); }

	@media (prefers-reduced-motion: reduce) {
		.go, .tab { transition: none; }
		:global(.js) .panel:not(.off) { animation: none; }
	}
</style>
