<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import AuroraWaves from '$lib/components/ui/AuroraWaves.svelte';
	import { join, team } from '$lib/content';
</script>

{#snippet field()}<AuroraWaves strength={1.1} speed={0.4} glow={15} />{/snippet}
<Section id="join" heading={join.heading} lede={join.lede} illuminated background={field}>
	<!-- One card per team: booking office hours with its lead is how you join. -->
	<section id="office-hours" class="scroll-mt-24" aria-labelledby="office-hours-heading">
		<h2 id="office-hours-heading" class="sr-only">Book office hours with a team lead</h2>
		<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" data-stagger>
			{#each team.members as m (m.name)}
				<li data-reveal>
					<a
						href={m.officeHours}
						target="_blank"
						rel="noopener noreferrer"
						class="flex h-full flex-col rounded-lg border p-6 transition-transform duration-200 hover:-translate-y-0.5"
						style:border-color="var(--line)"
						style:background="var(--surface)"
					>
						<span class="text-xl font-medium">{m.leads}</span>
						<span class="mt-1 text-sm" style:color="var(--muted)">with {m.name}</span>
						<span class="mt-5 text-sm font-medium" style:color="var(--accent)">
							Book office hours ↗<span class="sr-only"> with {m.name}, who leads the {m.leads} team (opens in a new tab)</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>

	<a
		href={join.discord.href}
		target="_blank"
		rel="noopener noreferrer"
		data-reveal
		class="group mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border p-6"
		style:border-color="var(--line)"
		style:background="var(--surface)"
	>
		<div class="min-w-0">
			<h2 class="text-lg">{join.discord.title}</h2>
			<p class="mt-1 text-[0.95rem] leading-relaxed" style:color="var(--muted)">{join.discord.body}</p>
		</div>
		<span class="inline-flex items-center gap-1.5 text-sm font-medium">
			{join.discord.cta}
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
		</span>
	</a>
</Section>
