<script lang="ts">
	import { onMount } from 'svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import { site } from '$lib/site';
	import type { ClubEvent } from '$lib/site';
	const { events, social } = site();

	/* Split by today's date, redone in the browser in case the page sat open
	   overnight. Club time is America/Chicago. */
	const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
	let now = $state(today());
	onMount(() => (now = today()));

	const upcoming = $derived(events.items.filter((e) => (e.dateEnd ?? e.date) >= now));
	const past = $derived(events.items.filter((e) => (e.dateEnd ?? e.date) < now).reverse());
	const discord = social.find((s) => s.name === 'Discord')?.href;

	/* A run of days collapses to one stamp: "SEP 9 to 10". */
	const fmtDate = (iso: string, isoEnd?: string) => {
		const d = new Date(iso + 'T12:00:00');
		const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		if (!isoEnd) return { month, day: String(d.getDate()), weekday: d.toLocaleString('en-US', { weekday: 'long' }) };
		const e = new Date(isoEnd + 'T12:00:00');
		const short = (x: Date) => x.toLocaleString('en-US', { weekday: 'short' });
		return { month, day: `${d.getDate()} to ${e.getDate()}`, weekday: `${short(d)} to ${short(e)}` };
	};
</script>

{#snippet card(e: ClubEvent)}
	{@const d = fmtDate(e.date, e.dateEnd)}
	<li data-reveal class="card event">
		<div class="top">
			<div class="date-stamp">
				<span class="month">{d.month}</span>
				<span class="day" class:range={d.day.length > 2}>{d.day}</span>
			</div>
			<div class="meta">
				<span class="tag-pill red kind">{e.kind}</span>
				<span class="when">{[d.weekday, e.time, e.location].filter(Boolean).join(' · ')}</span>
			</div>
		</div>
		<h3>{e.name}</h3>
		<p class="body">{e.body}</p>
	</li>
{/snippet}

<!-- One slide: what's coming up, then past events in a row that scrolls sideways. -->
<Section id="events" heading={events.heading} lede={events.lede} mascot={{ wave: true, mood: 'happy' }}>
	<h2 class="group-title" data-reveal>{events.upcomingLabel}</h2>
	<div class="upcoming">
		{#if upcoming.length}
			<ul class="event-grid" data-stagger>
				{#each upcoming as e (e.date + e.name)}{@render card(e)}{/each}
			</ul>
		{:else}
			<div class="card empty" data-reveal>
				<Badge size={60} prop="cloud" />
				<p>
					{events.empty}
					{#if discord}<a href={discord} target="_blank" rel="noopener noreferrer" class="discord">{events.discordCta} ↗</a>{/if}
				</p>
			</div>
		{/if}
	</div>

	{#if past.length}
		<h2 class="group-title past" data-reveal>{events.pastLabel}</h2>
	{/if}

	{#snippet bleed()}
		{#if past.length}
			<div class="past-list">
				<Rail>
					{#each past as e (e.date + e.name)}{@render card(e)}{/each}
				</Rail>
			</div>
		{/if}
	{/snippet}
</Section>

<style>
	.group-title { font-family: var(--font-sans); font-size: clamp(1.3rem, min(2.2vw, 4svh), 1.9rem); font-weight: 800; letter-spacing: -0.02em; }
	.group-title.past { margin-top: clamp(1rem, 2.8svh, 2.25rem); }
	.upcoming { margin-top: clamp(0.6rem, 1.8svh, 1.1rem); }
	.event-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: 1rem; list-style: none; padding: 0; }
	.event { display: flex; flex-direction: column; min-width: 0; padding: clamp(0.9rem, 2.2svh, 1.4rem) clamp(1rem, 1.6vw, 1.4rem); }
	.top { display: flex; align-items: center; gap: 0.9rem; }
	.date-stamp {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: 4.5rem;
		padding: 0.5rem 0.65rem 0.6rem;
		border-radius: var(--r);
		background: var(--cream);
		color: var(--ink);
		box-shadow: 0 8px 18px -12px rgb(0 0 0 / .9);
		transform: rotate(-3deg);
	}
	.month { font-family: var(--font-display); font-size: 0.85rem; font-weight: 700; line-height: 1.2; color: #b3060d; }
	.day { font-family: var(--font-display); font-size: 1.9rem; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
	.day.range { font-size: 1.05rem; line-height: 1.25; text-align: center; }
	.meta { display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem; min-width: 0; }
	.kind { padding: 0.15rem 0.7rem; font-size: 0.8rem; text-transform: lowercase; }
	.when { font-size: 0.92rem; line-height: 1.4; color: var(--muted); }
	h3 { margin-top: clamp(0.6rem, 1.6svh, 0.9rem); font-family: var(--font-sans); font-size: clamp(1.15rem, min(1.6vw, 2.9svh), 1.35rem); font-weight: 800; line-height: 1.2; letter-spacing: -0.015em; }
	.body { margin-top: 0.3rem; font-size: clamp(0.95rem, min(1.15vw, 2.1svh), 1rem); line-height: 1.5; color: var(--muted); }
	.past-list { --rail-card: clamp(17rem, 25vw, 22.5rem); }
	.past-list :global(.event) { background: transparent; box-shadow: none; }
	.past-list :global(.date-stamp) { background: var(--surface-2); color: var(--fg); box-shadow: none; transform: none; }
	.past-list :global(.month) { color: var(--muted); }
	.past-list :global(.kind) { background: var(--surface-2); border-color: var(--line-strong); color: var(--muted); }
	.empty { display: flex; align-items: center; gap: 1.25rem; padding: clamp(0.8rem, 2svh, 1.25rem) clamp(1rem, 2.6svh, 1.5rem); }
	.empty p { font-size: clamp(1rem, min(1.35vw, 2.5svh), 1.15rem); line-height: 1.6; color: var(--muted); }
	.discord { margin-left: 0.25rem; font-weight: 600; color: var(--accent); }
	.discord:hover { text-decoration: underline; text-underline-offset: 3px; }
	@media (max-width: 480px) {
		.empty { flex-direction: column; align-items: flex-start; }
	}
</style>
