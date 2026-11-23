<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { initMotion } from '$lib/motion';
	import { fly } from 'svelte/transition';
	import { expoOut } from 'svelte/easing';
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import CursorMark from '$lib/components/CursorMark.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import SocialIcon from '$lib/components/SocialIcon.svelte';
	import EmailLink from '$lib/components/EmailLink.svelte';
	import NewsletterForm from '$lib/components/NewsletterForm.svelte';
	import { provideSite, richHtml } from '$lib/site';

	let { children, data } = $props();
	provideSite(() => data.site);
	const { club, social, contact, newsletter } = $derived(data.site);

	let still = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		still = mq.matches;
		const on = () => (still = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	/* Re-run scroll choreography after every navigation: the keyed <main> swaps
	   the whole subtree, so the previous page's triggers are stale. */
	$effect(() => {
		page.url.pathname;
		let dispose: (() => void) | undefined;
		let cancelled = false;

		tick().then(() => {
			if (cancelled) return;
			try {
				dispose = initMotion();
			} catch (err) {
				/* Motion is decoration. If it fails, drop the `js` flag so the CSS
				   fallback renders every section fully visible. */
				console.error('[motion] init failed, revealing all content', err);
				document.documentElement.classList.remove('js');
			}
		});

		return () => {
			cancelled = true;
			dispose?.();
		};
	});

</script>

<svelte:head>
	<link rel="canonical" href="https://agenticaiuw.com{page.url.pathname}" />
</svelte:head>

<Nav />

{#key page.url.pathname}
	<main
		in:fly={{ y: still ? 0 : 14, duration: still ? 0 : 420, easing: expoOut }}
	>
		{@render children()}
	</main>
{/key}

<footer class="site-footer">
	<div class="shell">
		<div class="footer-card">
			<div class="f-brand">
				<a href="/" class="f-logo"><CursorMark size={40} /><span>{club.name}</span></a>
			</div>

			<div class="f-cols">
				<div>
					<h2 class="f-head">Follow</h2>
					<ul class="f-list">
						{#each social as s (s.name)}
							<li>
								{#if s.href}
									<a href={s.href} target="_blank" rel="noopener noreferrer" class="f-link">
										<SocialIcon name={s.name} />
										{s.name}
									</a>
								{:else}
									<!-- Add the link in the hub and this becomes a live link. -->
									<span class="f-link off" title="URL not set yet">
										<SocialIcon name={s.name} />
										{s.name}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
				<div class="f-contact">
					<h2 class="f-head">{contact.heading}</h2>
					<p>{contact.lede}</p>
					<span class="f-email"><EmailLink email={contact.email} class="font-semibold" /></span>
				</div>
			</div>

			<NewsletterForm text={newsletter} />

			<div class="f-badge" aria-hidden="true"><Badge size={150} mood="happy" /></div>
		</div>

		<div class="f-bottom">
			<span>© {new Date().getFullYear()} {club.name}. Founded {club.founded}.</span>
			<a href="/faq/">Frequently asked questions</a>
		</div>
	</div>
</footer>

<style>
	.site-footer { padding: 2rem 0 2.5rem; }
	.footer-card {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2.5rem 3rem;
		padding: clamp(1.75rem, 4vw, 2.75rem);
		padding-right: clamp(1.75rem, 14vw, 12rem);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--shadow);
	}
	.f-logo { display: inline-flex; align-items: center; gap: 0.7rem; font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; line-height: 1.2; }
	.f-cols { display: flex; flex-wrap: wrap; gap: 2rem 3.5rem; }
	.f-head { font-size: 1.05rem; font-weight: 700; }
	.f-list { display: grid; gap: 0.6rem; margin-top: 0.9rem; list-style: none; padding: 0; }
	.f-link { display: inline-flex; align-items: center; gap: 0.55rem; font-size: 0.95rem; color: var(--muted); transition: color 0.2s ease; }
	.f-link:hover { color: var(--fg); }
	.f-link.off { color: var(--faint); }
	.f-contact { max-width: 17rem; }
	.f-contact p { margin-top: 0.9rem; font-size: 0.95rem; line-height: 1.55; color: var(--muted); }
	.f-email { display: inline-block; margin-top: 0.6rem; color: var(--accent); }
	.f-badge { position: absolute; right: clamp(0.5rem, 2vw, 1.75rem); bottom: -0.5rem; transform: rotate(6deg); }
	.f-bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1.5rem; margin-top: 1.25rem; padding-inline: 0.5rem; font-size: 0.9rem; color: var(--muted); }
	.f-bottom a:hover { color: var(--fg); text-decoration: underline; text-underline-offset: 3px; }
	@media (max-width: 860px) {
		.footer-card { grid-template-columns: minmax(0, 1fr); padding-right: clamp(1.75rem, 4vw, 2.75rem); padding-bottom: 8.5rem; }
		.f-badge :global(svg) { width: 118px !important; }
	}
</style>
