<script lang="ts">
	import Section from '$lib/components/Section.svelte';
	import EmailLink from '$lib/components/EmailLink.svelte';
	import { site } from '$lib/site';
	const { contact, partners } = site();
</script>

<!-- One slide: the ways to work with the club and who to email. -->
<Section id="partners" heading={partners.heading} lede={partners.lede} mascot={{ prop: 'business', mood: 'happy' }}>
	<ul class="ways" role="list" data-stagger>
		{#each partners.ways as w (w.title)}
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
	.ways { display: grid; grid-template-columns: minmax(0, 1fr); gap: clamp(0.75rem, 1.6svh, 1rem); list-style: none; padding: 0; }
	@media (min-width: 370px) { .ways { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (min-width: 1100px) { .ways { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	.way { display: flex; flex-direction: column; gap: clamp(0.45rem, 1.4svh, 0.75rem); min-width: 0; padding: clamp(1.1rem, min(2vw, 3.2svh), 1.75rem); }
	.way:first-child { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.way h2 { font-family: var(--font-sans); font-size: clamp(1.15rem, min(1.75vw, 3.2svh), 1.6rem); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; }
	.way p { font-size: clamp(0.98rem, min(1.15vw, 2.2svh), 1.1rem); line-height: 1.55; color: var(--muted); }
	.contact-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem 1.5rem; margin-top: clamp(1rem, 3.5svh, 2.25rem); padding: clamp(1.1rem, min(2.6vw, 4svh), 2rem); border-radius: var(--r-lg); background: var(--red); color: #fff; box-shadow: 0 20px 40px -24px rgb(209 18 27 / .9); }
	.contact-title { font-family: var(--font-sans); font-size: clamp(1.25rem, min(2.3vw, 4svh), 1.9rem); font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; }
	.contact-email { font-size: clamp(1.05rem, 1.6vw, 1.25rem); font-weight: 600; }
	.contact-email :global(a) { color: #fff; text-decoration: underline; text-underline-offset: 4px; }
	.contact-email :global(button), .contact-email :global(span[aria-live]) { color: #fff !important; border-color: rgb(255 255 255 / .55) !important; }
</style>
