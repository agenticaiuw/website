<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import EmailLink from '$lib/components/EmailLink.svelte';
	import { site } from '$lib/site';
	const { contact, partners } = site();
</script>

<Section id="partners" heading={partners.heading} lede={partners.lede} mascot={{ prop: 'business', mood: 'happy' }}>
	<ul class="ways" role="list" data-stagger>
		{#each partners.ways as w, i (w.title)}
			<li data-reveal class="card way">
				
				<h2>{w.title}</h2>
				<p>{w.body}</p>
			</li>
		{/each}
	</ul>

	<div data-reveal class="contact-card">
		<p class="contact-title">{partners.contactTitle}</p>
		<span class="contact-email"><EmailLink email={contact.email} /></span>
	</div>
</Section>

<style>
	.ways { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.85rem; list-style: none; padding: 0; }
	@media (min-width: 640px) { .ways { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (min-width: 1100px) { .ways { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	.way { display: flex; flex-direction: column; gap: 0.7rem; padding: 1.6rem; }
	.way h2 { font-size: 1.4rem; line-height: 1.2; }
	.way p { font-size: 1rem; line-height: 1.6; color: var(--muted); }
	.contact-card { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.5rem; margin-top: 2.5rem; padding: clamp(1.4rem, 3vw, 2rem); border-radius: var(--r-lg); background: var(--red); color: #fff; box-shadow: 0 20px 40px -24px rgb(209 18 27 / .9); }
	.contact-title { font-family: var(--font-display); font-size: clamp(1.3rem, 2.4vw, 1.6rem); font-weight: 700; line-height: 1.25; }
	.contact-email { font-size: 1.15rem; font-weight: 600; }
	.contact-email :global(a) { color: #fff; text-decoration: underline; text-underline-offset: 4px; }
	.contact-email :global(button), .contact-email :global(span[aria-live]) { color: #fff !important; border-color: rgb(255 255 255 / .55) !important; }
</style>
