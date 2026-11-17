<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { site } from '$lib/site';
	const { join, team } = site();
</script>

<Section id="join" heading={join.heading} lede={join.lede} mascot={{ wave: true, mood: 'happy' }}>
	<!-- Step one: the Discord, the club's official channel. -->
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

	<!-- Step two: one card per team; booking office hours with its head is how you join a team. -->
	<section id="office-hours" class="office-hours scroll-mt-24" aria-labelledby="office-hours-heading">
		<h2 id="office-hours-heading" data-reveal>{join.officeHoursHeading}</h2>
		<ul class="oh-grid" role="list" data-stagger>
			{#each team.members as m (m.name)}
				<li data-reveal>
					<a href={m.officeHours} target="_blank" rel="noopener noreferrer" class="card oh-card">
						<span class="oh-art" aria-hidden="true"><Badge size={64} prop={m.subteam} sticker={false} /></span>
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
	</section>
</Section>

<style>
	.discord-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.25rem 2rem; padding: clamp(1.6rem, 4vw, 2.5rem); border-radius: var(--r-lg); background: linear-gradient(120deg, #2c3a8c, #4752c4); box-shadow: var(--shadow); color: #fff; transition: transform .3s var(--ease-spring); }
	.discord-card:hover { transform: translateY(-3px); }
	.discord-label { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: #cdd2ff; }
	.discord-card h2 { margin-top: 0.2rem; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.1; }
	.discord-body { margin-top: 0.5rem; max-width: 40rem; font-size: 1.05rem; line-height: 1.55; color: #e3e6ff; }

	.office-hours { margin-top: clamp(2.5rem, 5vw, 3.5rem); }
	.office-hours h2 { font-size: clamp(1.4rem, 2.6vw, 1.8rem); }
	.oh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 0.85rem; margin-top: 1.1rem; list-style: none; padding: 0; }
	.oh-card { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.9rem 1rem; height: 100%; padding: 1.1rem 1.25rem; transition: transform .3s var(--ease-spring), border-color .2s ease; }
	.oh-card:hover { transform: translateY(-3px); border-color: var(--line-strong); }
	.oh-art { display: grid; place-items: center; width: 4.25rem; height: 4.25rem; border-radius: 1.25rem; background: var(--cream); }
	.oh-text { display: grid; min-width: 0; }
	.oh-team { font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; line-height: 1.2; }
	.oh-lead { margin-top: 0.1rem; font-size: 0.95rem; color: var(--muted); }
	.oh-cta { grid-column: 1 / -1; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.55rem 1rem; border-radius: 999px; background: var(--surface-2); border: 1.5px solid var(--line-strong); font-family: var(--font-display); font-size: 0.95rem; font-weight: 700; line-height: 1.25; text-align: center; transition: background-color .2s ease, border-color .2s ease; }
	.oh-card:hover .oh-cta { background: var(--red); border-color: var(--red); color: #fff; }
	@media (prefers-reduced-motion: reduce) { .discord-card { transition: none; } }
</style>
