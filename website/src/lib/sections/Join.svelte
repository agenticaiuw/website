<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { site } from '$lib/site';
	const { join, team } = site();
</script>

<!-- Slide 1: the heading, then step one: the Discord, the club's official channel. -->
<Section id="join" heading={join.heading} lede={join.lede} mascot={{ wave: true, mood: 'happy' }}>
	<a id="discord" href={join.discordHref} target="_blank" rel="noopener noreferrer" data-reveal class="discord-card scroll-mt-24">
		<div class="min-w-0">
			{#if join.discordLabel}<p class="discord-label">{join.discordLabel}</p>{/if}
			<h2>{join.discordTitle}</h2>
			<p class="discord-body">{join.discordBody}</p>
		</div>
		<span class="btn btn-cream">
			{join.discordCta}
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
		</span>
	</a>
</Section>

<!-- Slide 2: one card per team; booking office hours with its head is how you join a team. -->
<section id="office-hours" class="slide office-hours scroll-mt-20" aria-labelledby="office-hours-heading">
	<div class="shell">
		<h2 id="office-hours-heading" class="slide-title" data-reveal>{join.officeHoursHeading}</h2>
		<ul class="oh-grid" role="list" data-stagger>
			{#each team.members as m (m.name)}
				<li data-reveal>
					<a href={m.officeHours} target="_blank" rel="noopener noreferrer" class="card oh-card">
						<span class="oh-art" aria-hidden="true"><Badge size="100%" prop={m.subteam} sticker={false} /></span>
						<span class="oh-text">
							<span class="oh-team">{m.leads}</span>
							<span class="oh-lead">with {m.name}</span>
						</span>
						<span class="oh-cta">
							{join.officeHoursCta} <span aria-hidden="true">↗</span><span class="sr-only"> with {m.name}, who heads the {m.leads} team (opens in a new tab)</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</section>

<style>
	.discord-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.25rem 2rem; padding: clamp(1.4rem, min(4vw, 5svh), 2.75rem); border-radius: var(--r-lg); background: linear-gradient(120deg, #2c3a8c, #4752c4); box-shadow: var(--shadow); color: #fff; transition: transform .3s var(--ease-spring); }
	.discord-card:hover { transform: translateY(-3px); }
	.discord-label { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: #cdd2ff; }
	.discord-card h2 { margin-top: 0.2rem; font-family: var(--font-sans); font-size: clamp(1.8rem, min(4vw, 7svh), 3.2rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.03em; }
	.discord-body { margin-top: 0.5rem; max-width: 40rem; font-size: clamp(1rem, min(1.4vw, 2.5svh), 1.2rem); line-height: 1.55; color: #e3e6ff; }

	.oh-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(0.75rem, 1.6svh, 1rem); margin-top: clamp(1.1rem, 3.5svh, 2.25rem); list-style: none; padding: 0; }
	@media (min-width: 900px) { .oh-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	/* each head as a small upright card: badge, team, name, then the button */
	.oh-card { display: grid; grid-template-rows: auto 1fr auto; gap: clamp(0.6rem, 1.6svh, 0.9rem); height: 100%; padding: clamp(1rem, 2.4svh, 1.4rem); transition: transform .3s var(--ease-spring), border-color .2s ease; }
	.oh-card:hover { transform: translateY(-3px); border-color: var(--line-strong); }
	.oh-art { display: grid; place-items: center; width: clamp(3.25rem, min(5.5vw, 8.5svh), 4.75rem); aspect-ratio: 1; padding: 0.3rem; border-radius: 1.1rem; background: var(--cream); }
	.oh-text { display: grid; align-content: start; min-width: 0; }
	.oh-team { overflow-wrap: break-word; font-family: var(--font-sans); font-size: clamp(1.15rem, min(1.7vw, 3.1svh), 1.5rem); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; }
	.oh-lead { margin-top: 0.15rem; font-size: 0.98rem; color: var(--muted); overflow-wrap: break-word; }
	.oh-cta { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.55rem 1rem; border-radius: 999px; background: var(--surface-2); border: 1.5px solid var(--line-strong); font-family: var(--font-display); font-size: 0.95rem; font-weight: 700; line-height: 1.25; text-align: center; transition: background-color .2s ease, border-color .2s ease; }
	.oh-card:hover .oh-cta { background: var(--red); border-color: var(--red); color: #fff; }
	/* phones: two cards to a row, so every head fits on about one screen */
	@media (max-width: 640px) {
		.oh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
		.oh-card { gap: 0.5rem; padding: 0.9rem; }
		.oh-art { width: 3rem; border-radius: 0.9rem; }
		.oh-team { font-size: 1.1rem; }
		.oh-lead { font-size: 0.88rem; }
		.oh-cta { padding: 0.45rem 0.6rem; font-size: 0.85rem; }
	}
	@media (prefers-reduced-motion: reduce) { .discord-card { transition: none; } }
</style>
