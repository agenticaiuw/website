<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import EmailLink from '$lib/components/EmailLink.svelte';
	import { contact, partners } from '$lib/content';
</script>

<Section id="partners" heading={partners.heading} lede={partners.lede}>
	<ul class="grid gap-4 sm:grid-cols-2" role="list" data-stagger>
		{#each partners.ways as w (w.title)}
			<li data-reveal class="rounded-lg border p-6" style:border-color="var(--line)" style:background="var(--surface)">
				<h2 class="text-lg font-medium">{w.title}</h2>
				<p class="mt-2 text-[0.95rem] leading-relaxed" style:color="var(--muted)">{w.body}</p>
			</li>
		{/each}
	</ul>

	<div data-reveal class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border p-6" style:border-color="var(--accent-border)" style:background="var(--accent-surface)">
		<p class="text-lg font-medium">Email us and we’ll get back to you</p>
		<EmailLink email={contact.email} class="text-lg" />
	</div>
</Section>
