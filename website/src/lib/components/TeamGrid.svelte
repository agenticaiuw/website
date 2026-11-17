<script lang="ts">
	import { site } from '$lib/site';
	const { team } = site();
	import Badge from './Badge.svelte';
	import Rail from './Rail.svelte';

	/* The founding board cards on the home page, drawn like collectible cards:
	   badge holds each team's tool. Booking links stay on the Join page. */
	const TILE: Record<string, string> = {
		hardware: '#4a3812',
		cloud: '#1d3350',
		automation: '#26324a',
		os: '#26324a',
		browser: '#1f3a28',
		research: '#33284a',
		architecture: '#33284a',
		design: '#4a2233',
		ux: '#4a2233',
		business: '#2b3a1c'
	};
</script>

<Rail>
	{#each team.members as m (m.name)}
		<li data-reveal class="card member">
			<div class="art" style:--tile={TILE[m.subteam] ?? 'var(--surface-2)'}>
				<Badge size={128} prop={m.subteam} mood={['business', 'ux', 'design'].includes(m.subteam) ? 'happy' : 'rest'} />
				{#if m.photo}
					<img src={m.photo} alt="" width="64" height="64" loading="lazy" class="photo" />
				{/if}
			</div>
			<div class="body">
				<h3>{m.name}</h3>
				<p class="role">{m.title}</p>
				<p class="leads-label">Heads</p>
				<a href="/teams/{m.subteam}/" class="team-link">
					{m.leads} team <span aria-hidden="true">→</span>
				</a>
				{#if m.blurb}
					<p class="blurb">{m.blurb}</p>
				{/if}
				<a href={m.linkedin} target="_blank" rel="noopener noreferrer" class="linkedin">
					LinkedIn <span aria-hidden="true">↗</span><span class="sr-only"> for {m.name} (opens in a new tab)</span>
				</a>
			</div>
		</li>
	{/each}
</Rail>

<style>
	.member {
		display: flex;
		flex-direction: column;
		padding: 0.6rem;
		transition: transform 0.3s var(--ease-spring), box-shadow 0.3s ease;
	}

	/* Short screens: a smaller badge keeps the whole gallery on one screen. */
	@media (max-height: 700px) {
		.art { padding: 0.7rem 0 0.4rem; }
		.art :global(.badge) { width: 92px !important; }
	}
	.member:hover { transform: translateY(-4px) rotate(-0.4deg); box-shadow: var(--shadow-lift); }
	.art {
		position: relative;
		display: grid;
		place-items: center;
		padding: 1.1rem 0 0.7rem;
		border-radius: calc(var(--r-lg) - 0.45rem);
		background: radial-gradient(circle at 50% 35%, color-mix(in oklab, var(--tile) 80%, white 12%), var(--tile) 70%);
	}
	.photo { position: absolute; right: 0.75rem; bottom: -1.25rem; width: 3.5rem; height: 3.5rem; border-radius: 50%; border: 3px solid var(--surface); object-fit: cover; }
	.body { display: flex; flex-direction: column; flex: 1; padding: 1rem 0.8rem 0.6rem; }
	h3 { font-size: 1.35rem; line-height: 1.2; }
	.role { margin-top: 0.15rem; font-size: 0.95rem; color: var(--muted); }
	.leads-label {
		margin-top: 0.9rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--faint);
	}
	.team-link {
		align-self: flex-start;
		margin-top: 0.35rem;
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		border: 1.5px solid var(--line-strong);
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		line-height: 1.3;
		transition: border-color 0.2s ease, color 0.2s ease;
	}
	.team-link:hover { border-color: var(--accent); color: var(--accent); }
	.blurb { margin-top: 0.85rem; font-size: 0.95rem; line-height: 1.55; color: var(--muted); }
	.linkedin { margin-top: auto; padding-top: 1rem; font-weight: 600; color: var(--accent); align-self: flex-start; }
	.linkedin:hover { text-decoration: underline; text-underline-offset: 3px; }
</style>
