<script lang="ts">
	import { team } from '$lib/content';

	/* The founding board cards on the home page. Booking links stay on the Join
	   page so nothing is repeated. */
	const initials = (name: string) => name.split(' ').map((word) => word[0]).join('');
</script>

<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list" data-stagger>
	{#each team.members as m (m.name)}
		<li data-reveal class="flex min-w-0 flex-col rounded-lg border p-6" style:border-color="var(--line)" style:background="var(--surface)">
			<div class="flex items-center gap-4">
				{#if m.photo}
					<img src={m.photo} alt="" width="64" height="64" loading="lazy" class="h-16 w-16 shrink-0 rounded-full border object-cover" style:border-color="var(--line)" />
				{:else}
					<div aria-hidden="true" class="grid h-16 w-16 shrink-0 place-items-center rounded-full border font-mono text-base font-medium" style:border-color="var(--accent-border)" style:background="var(--accent-surface)" style:color="var(--accent)">
						{initials(m.name)}
					</div>
				{/if}
				<div class="min-w-0">
					<h3 class="text-lg leading-tight font-medium">{m.name}</h3>
					<p class="mt-1.5 font-mono text-[0.68rem] leading-snug tracking-[0.12em] uppercase" style:color="var(--accent)">{m.title}</p>
				</div>
			</div>

			<p class="mt-5 font-mono text-[0.62rem] tracking-[0.14em] uppercase" style:color="var(--muted)">Leads</p>
			<a href="/teams/#team-{m.subteam}" class="group mt-1 inline-flex items-center gap-1.5 self-start text-lg font-medium hover:underline">
				{m.leads} team
				<span class="transition-transform duration-200 group-hover:translate-x-1" style:color="var(--accent)" aria-hidden="true">→</span>
			</a>

			{#if m.blurb}
				<p class="mt-3 text-sm leading-relaxed" style:color="var(--muted)">{m.blurb}</p>
			{/if}

			<div class="mt-auto pt-5 text-sm">
				<a href={m.linkedin} target="_blank" rel="noopener noreferrer" class="font-medium hover:underline" style:color="var(--accent)">
					LinkedIn ↗<span class="sr-only"> for {m.name} (opens in a new tab)</span>
				</a>
			</div>
		</li>
	{/each}
</ul>
