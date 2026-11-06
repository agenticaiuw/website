<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { nav, club } from '$lib/content';
	import CursorMark from './CursorMark.svelte';

	let scrolled = $state(false);
	let open = $state(false);
	let theme = $state<'dark' | 'light'>('dark');

	const path = $derived(page.url.pathname.replace(/\/$/, '') || '/');
	const isActive = (href: string) => path === href;

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		try { localStorage.setItem('theme', theme); } catch (e) { /* private mode */ }
	}

	onMount(() => {
		theme = (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark';
		const onScroll = () => (scrolled = window.scrollY > 24);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	/* close the mobile menu whenever the route changes */
	$effect(() => { path; open = false; });
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && (open = false)} />

<header
	class="fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300"
	style:background={scrolled ? 'color-mix(in oklab, var(--bg) 82%, transparent)' : 'transparent'}
	style:backdrop-filter={scrolled ? 'blur(14px)' : 'none'}
	style:border-bottom="1px solid {scrolled ? 'var(--line)' : 'transparent'}"
>
	<div class="shell flex h-16 items-center justify-between gap-6">
		<a href="/" class="group flex items-center gap-2.5 text-sm font-semibold tracking-tight" style:color="var(--fg)">
			<CursorMark class="h-[19px] w-[19px] shrink-0 transition-transform duration-300 group-hover:-rotate-12" />
			<span>{club.shortName}&nbsp;<span style:color="var(--muted)">UW</span></span>
		</a>

		<nav class="hidden items-center gap-1 lg:flex" aria-label="Sections">
			{#each nav as item (item.id)}
				<a
					href={item.href}
					class="group relative rounded px-3 py-2 text-sm transition-colors duration-200"
					style:color={isActive(item.href) ? 'var(--fg)' : 'var(--muted)'}
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					{item.label}
					<span
						class="absolute inset-x-3 -bottom-px h-px origin-left transition-transform duration-300"
						style:background="var(--accent)"
						style:transform="scaleX({isActive(item.href) ? 1 : 0})"
					></span>
				</a>
			{/each}
		</nav>

		<div class="flex items-center gap-2">
			<button
				onclick={toggleTheme}
				class="grid h-9 w-9 place-items-center rounded-md border transition-colors duration-200 hover:brightness-125"
				style:border-color="var(--line)"
				aria-label="Switch to {theme === 'dark' ? 'light' : 'dark'} mode"
			>
				{#if theme === 'dark'}
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
					</svg>
				{:else}
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" />
					</svg>
				{/if}
			</button>

			<a
				href="/join/"
				class="rounded-md px-4 py-2 text-sm font-medium transition-transform duration-200 hover:-translate-y-px"
				style:background="var(--accent)"
				style:color="var(--accent-ink)"
			>
				Join
			</a>

			<button
				onclick={() => (open = !open)}
				class="grid h-9 w-9 place-items-center rounded-md border lg:hidden"
				style:border-color="var(--line)"
				aria-label={open ? 'Close menu' : 'Open menu'}
				aria-expanded={open}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
					{#if open}<path d="M18 6 6 18M6 6l12 12" />{:else}<path d="M3 7h18M3 17h18" />{/if}
				</svg>
			</button>
		</div>
	</div>

	{#if open}
		<nav
			class="shell grid gap-1 border-t py-4 lg:hidden"
			style:border-color="var(--line)"
			style:background="var(--bg)"
			aria-label="Sections"
		>
			{#each nav as item (item.id)}
				<a
					href={item.href}
					class="rounded px-2 py-2.5 text-base"
					style:color={isActive(item.href) ? 'var(--fg)' : 'var(--muted)'}
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>
	{/if}
</header>
