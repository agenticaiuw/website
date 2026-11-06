<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { initMotion } from '$lib/motion';
	import { fly } from 'svelte/transition';
	import { expoOut } from 'svelte/easing';
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import SocialIcon from '$lib/components/SocialIcon.svelte';
	import EmailLink from '$lib/components/EmailLink.svelte';
	import { club, social, contact, memberHub } from '$lib/content';

	let { children } = $props();

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

<footer class="border-t py-16" style:border-color="var(--line)">
	<div class="shell">
		<div class="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
			<div class="max-w-sm">
				<div class="flex items-center gap-2.5 font-mono text-sm font-semibold">
					<span class="inline-block h-2 w-2 rounded-full" style:background="var(--accent)"></span>
					{club.name}
				</div>
				<p class="mt-4 text-sm leading-relaxed" style:color="var(--muted)">
					A registered student organization at {club.university}. {club.motto}
				</p>
			</div>

			<div class="flex flex-col gap-8 sm:flex-row sm:gap-16">
				<div>
					<h4 class="eyebrow">Follow</h4>
					<ul class="mt-4 grid gap-2.5">
						{#each social as s (s.name)}
							<li>
								{#if s.href}
									<a href={s.href} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-sm transition-colors hover:underline" style:color="var(--muted)">
										<SocialIcon name={s.name} />
										{s.name}
									</a>
								{:else}
									<!-- Paste the URL into content.ts and this becomes a live link. -->
									<span class="inline-flex items-center gap-2 text-sm" style:color="var(--line-strong)" title="URL not set yet">
										<SocialIcon name={s.name} />
										{s.name}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
				<div>
					<h4 class="eyebrow">{contact.heading}</h4>
					<p class="mt-4 max-w-xs text-sm leading-relaxed" style:color="var(--muted)">{contact.lede}</p>
					<span class="mt-3 inline-block text-sm font-medium" style:color="var(--accent)">
						<EmailLink email={contact.email} class="font-medium" />
					</span>
				</div>
				<div>
					<h4 class="eyebrow">Members</h4>
					<p class="mt-4 max-w-xs text-sm leading-relaxed" style:color="var(--muted)">{memberHub.blurb}</p>
					<a href={memberHub.href} target="_blank" rel="noopener noreferrer" class="mt-3 inline-block text-sm font-medium hover:underline" style:color="var(--accent)">
						{memberHub.label} ↗<span class="sr-only"> (opens in a new tab)</span>
					</a>
				</div>
			</div>
		</div>

		<div class="mt-14 flex flex-col gap-2 border-t pt-7 text-xs sm:flex-row sm:items-center sm:justify-between" style:border-color="var(--line)" style:color="var(--muted)">
			<span>© {new Date().getFullYear()} {club.name}. Founded {club.founded}.</span>
			<a href="/faq/" class="hover:underline">Frequently asked questions</a>
		</div>
	</div>
</footer>
