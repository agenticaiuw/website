<script lang="ts">
	import { onMount } from 'svelte';
	import Section from '$lib/components/Section.svelte';
	import { events, social, type ClubEvent } from '$lib/content';

	/* The page is prerendered, so the split is redone in the browser with
	   today's date. Club time is America/Chicago. */
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
	<ul class="grid gap-px overflow-hidden rounded-lg border" style:border-color="var(--line)" style:background="var(--line)" data-stagger>
		{#each items as e (e.date + e.name)}
			{@const d = fmtDate(e.date, e.dateEnd)}
			<li data-reveal class="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-8 md:p-7" style:background="var(--surface)">
				<div class="date-stamp flex shrink-0 items-baseline gap-2 sm:w-20 sm:flex-col sm:items-center sm:gap-1">
					<span class="text-[0.7rem] font-medium tracking-[0.12em]" style:color="var(--accent)">{d.month}</span>
					<span class="font-semibold tabular-nums leading-none whitespace-nowrap {d.day.length > 2 ? 'text-sm' : 'text-2xl'}">{d.day}</span>
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="rounded px-2 py-0.5 text-[0.68rem] font-medium tracking-[0.08em] uppercase" style:background="var(--accent-surface)" style:color="var(--accent)">{e.kind}</span>
						<span class="text-xs" style:color="var(--muted)">{[d.weekday, e.time, e.location].filter(Boolean).join(' · ')}</span>
					</div>
					<h3 class="mt-2 text-lg">{e.name}</h3>
					<p class="mt-1 text-sm leading-relaxed" style:color="var(--muted)">{e.body}</p>
				</div>
			</li>
		{/each}
	</ul>
{/snippet}

<Section id="events" heading={events.heading} lede={events.lede}>
	<h2 class="text-xl font-medium">Upcoming</h2>
	<div class="mt-5">
		{#if upcoming.length}
			{@render list(upcoming)}
		{:else}
			<p class="rounded-lg border p-6 text-[0.95rem] leading-relaxed" style:border-color="var(--line)" style:color="var(--muted)">
				{events.empty}
				{#if discord}<a href={discord} target="_blank" rel="noopener noreferrer" class="ml-1 font-medium whitespace-nowrap hover:underline" style:color="var(--accent)">Join the Discord ↗</a>{/if}
			</p>
		{/if}
	</div>

	{#if past.length}
		<h2 class="mt-14 text-xl font-medium">Past</h2>
		<div class="mt-5">{@render list(past)}</div>
	{/if}
</Section>

<style>
	.date-stamp { border: 1px solid var(--accent-border); border-top: 3px solid var(--accent); border-radius: 5px; padding: .9rem .8rem; background: var(--accent-surface); width: fit-content; }
	@media (min-width: 640px) { .date-stamp { width: 5.5rem; min-height: 5rem; justify-content: center; } }
</style>
