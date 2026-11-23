<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Notice from '$lib/components/Notice.svelte';
	import { ERRORS, FLASH } from '$lib/flash';
	import { canRunBusiness, isExec } from '$lib/perm';
	import { initials } from '$lib/ui';

	let { data, children }: { data: { viewer: import('$lib/types').Viewer; collab: boolean }; children: Snippet } = $props();

	type NavKey = 'home' | 'tasks' | 'meetings' | 'teams' | 'handbook' | 'files' | 'email' | 'collaboration' | 'site';

	/** Simple line icons for the sidebar, drawn on a 24px grid. */
	const ICONS: Record<NavKey, string> = {
		home: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
		tasks: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11"/><circle cx="5.25" cy="18" r="1.5"/>',
		meetings: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
		teams: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.75"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.75"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.75"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.75"/>',
		handbook: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6"/>',
		files: '<path d="M3.5 7A2 2 0 0 1 5.5 5h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z"/>',
		collaboration: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
		email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
		site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/>'
	};

	const viewer = $derived(data.viewer);
	const links = $derived.by(() => {
		const list: [NavKey, string, string][] = [
			['home', '/', 'My work'],
			['tasks', '/tasks', 'Tasks'],
			['meetings', '/meetings', 'Meetings'],
			['teams', '/teams', 'Teams'],
			['handbook', '/handbook', 'Handbook'],
			['files', '/files', 'Files']
		];
		if (canRunBusiness(viewer)) list.push(['site', '/site', 'Website']);
		if (isExec(viewer)) list.push(['email', '/email', 'Email']);
		// Only once the agent workspace is connected; until then the page has nothing to show.
		if (isExec(viewer) && data.collab) list.push(['collaboration', '/collaboration', 'Collaboration']);
		return list;
	});
	const active = $derived(page.data.active as NavKey | undefined);

	// Short confirmations after a redirect (?ok=…, ?error=…). They're read once, then taken out of
	// the address so a reload doesn't show them again.
	const read = (url: URL) => ({ ok: FLASH[url.searchParams.get('ok') ?? ''] ?? '', err: ERRORS[url.searchParams.get('error') ?? ''] ?? '' });
	let notices = $state({ ...read(page.url), key: 0 });
	afterNavigate(({ type }) => {
		const next = read(page.url);
		if (type !== 'enter') notices = { ...next, key: notices.key + 1 };
		if (next.ok || next.err) {
			const url = new URL(page.url);
			url.searchParams.delete('ok');
			url.searchParams.delete('error');
			replaceState(url, page.state);
		}
	});
</script>

<div class="app">
	<aside class="sidebar">
		<a href="/" class="brand">
			<img src="/favicon.svg" alt="" width="28" height="28" />
			<span class="brand-text">The <span class="brand-hub">Hub</span></span>
		</a>
		<nav class="nav" aria-label="Main">
			{#each links as [key, href, label]}
				<a {href} aria-current={active === key ? 'page' : undefined}>
					<svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
						>{@html ICONS[key]}</svg
					>
					<span>{label}</span>
				</a>
			{/each}
		</nav>
		<img class="side-badge" src="/badge-wave.svg" alt="" width="76" height="70" />
		<div class="who">
			<a href="/people/{viewer.id}" class="who-name" title="Your profile">
				<span class="avatar" aria-hidden="true">{initials(viewer.name)}</span>
				<span class="who-text">{viewer.name}</span>
			</a>
			<form method="post" action="/logout" data-sveltekit-reload>
				<button class="link-btn">Sign out</button>
			</form>
		</div>
	</aside>
	<main class="main">
		{#if notices.ok || notices.err}
			{#key notices.key}
				<div class="system-notices">
					{#if notices.ok}<Notice>{notices.ok}</Notice>{/if}
					{#if notices.err}<Notice error>{notices.err}</Notice>{/if}
				</div>
			{/key}
		{/if}
		<div class="content">
			{#key page.url.pathname}
				{@render children()}
			{/key}
		</div>
	</main>
</div>
