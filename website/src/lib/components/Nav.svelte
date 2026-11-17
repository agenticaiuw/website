<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { site } from '$lib/site';
	const { nav, club, memberHub } = site();
	import CursorMark from './CursorMark.svelte';

	let scrolled = $state(false);
	let open = $state(false);

	const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');
	const isActive = (href: string) => path === href;

	onMount(() => {
		const onScroll = () => (scrolled = window.scrollY > 24);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	/* close the mobile menu whenever the route changes */
	$effect(() => { path; open = false; });
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && (open = false)} />

<header class="site-header" class:scrolled class:open>
	<div class="shell bar">
		<a href="/" class="brand" aria-label={club.name}>
			<CursorMark size={38} class="brand-mark" />
			<span class="brand-name">{club.shortName} <span>UW</span></span>
		</a>

		<nav class="links" aria-label="Sections">
			{#each nav as item (item.id)}
				<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>{item.label}</a>
			{/each}
		</nav>

		<div class="actions">
			<a href={memberHub.href} class="btn btn-ghost btn-sm hub-link" title={memberHub.blurb}>{memberHub.label}</a>
			<a href="/join/" class="btn btn-red btn-sm">Join</a>
			<button
				onclick={() => (open = !open)}
				class="menu-btn"
				aria-label={open ? 'Close menu' : 'Open menu'}
				aria-expanded={open}
				aria-controls="mobile-menu"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
					{#if open}<path d="M18 6 6 18M6 6l12 12" />{:else}<path d="M4 8h16M4 16h16" />{/if}
				</svg>
			</button>
		</div>
	</div>

	{#if open}
		<nav id="mobile-menu" class="shell mobile" aria-label="Sections">
			<div class="mobile-card">
				{#each nav as item (item.id)}
					<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
						<span>{item.label}</span>
					</a>
				{/each}
				<a href={memberHub.href} class="mobile-hub">
					<span>{memberHub.label}</span>
				</a>
			</div>
		</nav>
	{/if}
</header>

<style>
	.site-header {
		position: fixed;
		inset: 0 0 auto;
		z-index: 50;
		border-bottom: 1px solid transparent;
		transition: background-color 0.3s ease, border-color 0.3s ease;
	}
	.site-header.scrolled,
	.site-header.open {
		background: color-mix(in oklab, var(--bg) 86%, transparent);
		backdrop-filter: blur(16px) saturate(1.2);
		-webkit-backdrop-filter: blur(16px) saturate(1.2);
		border-color: var(--line);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 4.5rem;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		color: var(--fg);
	}
	.brand:hover :global(.brand-mark) { transform: scale(1.06); }
	.brand-name {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}
	.brand-name span { color: var(--accent); }

	.links {
		display: none;
		align-items: center;
		gap: 0.25rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: color-mix(in oklab, var(--surface) 80%, transparent);
	}
	.links a {
		padding: 0.45rem 1rem;
		border-radius: 999px;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--muted);
		transition: color 0.2s ease, background-color 0.2s ease;
	}
	.links a:hover { color: var(--fg); }
	.links a[aria-current='page'] { background: var(--cream); color: var(--ink); }

	.actions { display: flex; align-items: center; gap: 0.5rem; }
	.hub-link { display: none; }
	.menu-btn {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 999px;
		border: 2px solid var(--line-strong);
		color: var(--fg);
	}

	.mobile { padding-bottom: 1rem; }
	.mobile-card {
		display: grid;
		gap: 0.25rem;
		padding: 0.5rem;
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--shadow-lift);
	}
	.mobile-card a {
		display: grid;
		gap: 0.1rem;
		padding: 0.75rem 1rem;
		border-radius: var(--r);
	}
	.mobile-card a span { font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; line-height: 1.3; }
	.mobile-card a[aria-current='page'] { background: var(--surface-2); }
	.mobile-card a[aria-current='page'] span { color: var(--accent); }

	@media (min-width: 640px) {
		.hub-link { display: inline-flex; }
		.mobile-hub { display: none !important; }
	}
	@media (min-width: 1024px) {
		.links { display: flex; }
		.menu-btn, .mobile { display: none; }
	}
	@media (max-width: 380px) {
		.brand-name { font-size: 1.05rem; }
		.bar { gap: 0.5rem; }
	}
</style>
