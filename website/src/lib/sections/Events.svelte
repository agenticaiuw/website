<script lang="ts">
	import { onMount } from 'svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
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

{#snippet list(items: ClubEvent[])}
	<ul class="event-list" data-stagger>
		{#each items as e (e.date + e.name)}
			{@const d = fmtDate(e.date, e.dateEnd)}
			<li data-reveal class="card event">
				<div class="date-stamp">
					<span class="month">{d.month}</span>
					<span class="day" class:range={d.day.length > 2}>{d.day}</span>
				</div>
				<div class="min-w-0 flex-1">
					<div class="meta">
						<span class="tag-pill red kind">{e.kind}</span>
						<span class="when">{[d.weekday, e.time, e.location].filter(Boolean).join(' · ')}</span>
					</div>
					<h3>{e.name}</h3>
					<p class="body">{e.body}</p>
				</div>
			</li>
		{/each}
	</ul>
{/snippet}

<Section id="events" heading={events.heading} lede={events.lede} mascot={{ wave: true, mood: 'happy' }}>
	<h2 class="group-title">{events.upcomingLabel}</h2>
	<div class="mt-5">
		{#if upcoming.length}
			{@render list(upcoming)}
		{:else}
			<div class="card empty">
				<Badge size={84} prop="cloud" />
				<p>
					{events.empty}
					{#if discord}<a href={discord} target="_blank" rel="noopener noreferrer" class="discord">{events.discordCta} ↗</a>{/if}
				</p>
			</div>
		{/if}
	</div>

	{#if past.length}
		<h2 class="group-title past">{events.pastLabel}</h2>
		<div class="mt-5 past-list">{@render list(past)}</div>
	{/if}
</Section>

<style>
	.group-title { font-size: 1.6rem; }
	.group-title.past { margin-top: 3.5rem; }
	.event-list { display: grid; gap: 0.75rem; list-style: none; padding: 0; }
	.event { display: flex; gap: clamp(1rem, 3vw, 1.75rem); align-items: flex-start; padding: clamp(1.1rem, 3vw, 1.5rem); }
	.date-stamp {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: 4.75rem;
		padding: 0.6rem 0.7rem 0.7rem;
		border-radius: var(--r);
		background: var(--cream);
		color: var(--ink);
		box-shadow: 0 8px 18px -12px rgb(0 0 0 / .9);
		transform: rotate(-3deg);
	}
	.month { font-family: var(--font-display); font-size: 0.85rem; font-weight: 700; line-height: 1.2; color: #b3060d; }
	.day { font-family: var(--font-display); font-size: 2rem; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
	.day.range { font-size: 1.05rem; line-height: 1.25; text-align: center; }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.75rem; }
	.kind { padding: 0.15rem 0.7rem; font-size: 0.8rem; text-transform: lowercase; }
	.when { font-size: 0.95rem; line-height: 1.45; color: var(--muted); }
	h3 { margin-top: 0.55rem; font-size: 1.35rem; line-height: 1.2; }
	.body { margin-top: 0.35rem; font-size: 1rem; line-height: 1.6; color: var(--muted); }
	.past-list :global(.event) { background: transparent; box-shadow: none; }
	.past-list :global(.date-stamp) { background: var(--surface-2); color: var(--fg); box-shadow: none; transform: none; }
	.past-list :global(.month) { color: var(--muted); }
	.past-list :global(.kind) { background: var(--surface-2); border-color: var(--line-strong); color: var(--muted); }
	.empty { display: flex; align-items: center; gap: 1.25rem; padding: 1.5rem; }
	.empty p { font-size: 1.05rem; line-height: 1.6; color: var(--muted); }
	.discord { margin-left: 0.25rem; font-weight: 600; color: var(--accent); }
	.discord:hover { text-decoration: underline; text-underline-offset: 3px; }
	@media (max-width: 480px) {
		.event { flex-direction: column; }
		.empty { flex-direction: column; align-items: flex-start; }
	}
</style>
