<script lang="ts">
	import { onMount } from 'svelte';
	import { richHtml, site } from '$lib/site';
	const { project } = site();
	// What people download: GitHub builds each one from the repo's main branch on every push, and /latest/ always
	// serves the newest. A Mac build runs on every Mac (Apple silicon and Intel in one file).
	const builds = 'https://github.com/agenticaiuw/hive/releases/download/latest/';
	// Hive is the whole system. Hive Server runs on a computer that's always on; the Hive app goes on the laptop you
	// use every day and connects to it. Hive isn't in the App Store or Google Play: on iPhone it's sideloaded, or
	// installed from a signed link once the release has one.
	type Computer = 'mac' | 'windows' | 'linux';
	const computers: Record<Computer, { name: string; server?: string; app?: string }> = {
		mac: { name: 'Mac', server: 'Hive-Server.dmg', app: 'Hive-Mac.dmg' },
		windows: { name: 'Windows', server: 'hive-server-windows.exe', app: 'hive-windows.exe' },
		// Linux has Hive Server only, by one command.
		linux: { name: 'Linux' }
	};
	const extension = 'Hive-Browser.zip';
	const ipa = 'Hive.ipa';
	// Once GitHub signs Hive.ipa with the club's Apple team, the release also has manifest.plist, and this link installs
	// Hive straight onto an iPhone the club has registered. Until then the link would fail, so it isn't shown.
	const install = `itms-services://?action=download-manifest&url=${builds}manifest.plist`;
	const DEV_MODE = 'On your iPhone, open Settings > Privacy & Security > Developer Mode, turn it on, and restart when asked. Developer Mode appears there after Hive is installed.';
	let signed = $state(false);
	let checked = false;
	// GitHub's API lists the release's files; its download links can't be checked from a browser.
	function checkSigned() {
		if (checked) return;
		checked = true;
		fetch('https://api.github.com/repos/agenticaiuw/hive/releases/tags/latest')
			.then((r) => (r.ok ? r.json() : null))
			.then((release) => (signed = !!release?.assets?.some((a: { name: string }) => a.name === 'manifest.plist')))
			.catch(() => {});
	}
	// A cloud server has no browser: this one command fetches the Linux build for its processor.
	const linux = `curl -fLo hive-server ${builds}hive-server-linux-$(uname -m) && chmod +x hive-server && sudo ./hive-server`;
	const SERVER_NOTE = 'For a computer that stays on and online 24/7: an old laptop at home, a desktop, or a cloud server. Hive runs here.';
	const APP_NOTE = 'For the laptop you use every day. It connects to your Hive Server so Hive can work on it.';

	// The visitor's system: a computer or phone gets one button for it; anything else goes to Show all.
	let os = $state('');
	onMount(() => {
		const p = navigator.platform || '';
		const ua = navigator.userAgent;
		os = /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) || (p === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
			: /Mac/.test(p) ? 'mac' : /Win/.test(p) ? 'windows' : /Linux/.test(p) ? 'linux' : '';
	});
	const computer = $derived(os in computers ? computers[os as Computer] : null);
	// A phone gets its own short window too: just what fits it, with Show all for the rest.
	const phone = $derived(os === 'ios' ? 'iPhone' : os === 'android' ? 'Android' : '');
	const picks = $derived(!!computer || !!phone);

	// One floating window: the question for this computer, or every download.
	let dialog: HTMLDialogElement;
	let view = $state<'pick' | 'all'>('pick');
	function open(v: 'pick' | 'all', section = '') {
		view = v;
		checkSigned();
		dialog.showModal();
		if (section) requestAnimationFrame(() => dialog.querySelector(`#${section}`)?.scrollIntoView({ block: 'start' }));
	}
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(linux);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// The command is selectable; copying by hand still works.
		}
	}
</script>

{#snippet command()}
	<div class="cmd">
		<code>{linux}</code>
		<button type="button" class="btn btn-ghost btn-sm" onclick={copy}>{copied ? 'Copied' : 'Copy command'}</button>
	</div>
{/snippet}

<!-- Slide 1: the logo and name, what Hive does, and the download right under it. -->
<section id="hive" class="slide hive-hero scroll-mt-16">
	<header class="shell hero-inner" data-hero>
		<div class="hero-grid">
			<div class="hero-copy">
				<!-- The logo beside the name, as one lockup. -->
				<h1 class="title"><img class="hive-logo" src="/images/hive-icon.png" alt="" width="256" height="256" data-word /><span class="word" data-word>{project.title}</span></h1>
				<p class="goal" data-hero-after>{@html richHtml(project.goal)}</p>
			</div>

			<!-- Like most download pages: one centred column, the download right under the intro. -->
			<div class="get-panel" data-hero-after>
				<div class="get-hive">
					<button type="button" class="btn btn-red get-btn" onclick={() => open(picks ? 'pick' : 'all')} aria-haspopup="dialog">
						{computer ? `Download for ${computer.name}` : phone ? `Get Hive for ${phone}` : 'Download Hive'} <span aria-hidden="true">↓</span>
					</button>
					<!-- Small, like other sites' download rows. The stores are placeholders until Hive is listed there. -->
					<div class="get-more">
						<span class="store soon" title="Coming soon to the App Store" aria-label="App Store, coming soon">
							<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5a4.3 4.3 0 0 0-3.4-1.8c-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8a4.5 4.5 0 0 0-3.8 2.3c-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2a9.6 9.6 0 0 0 1.2-2.6 4 4 0 0 1-2.4-3.7ZM14.2 5.8a4 4 0 0 0 .9-2.9 4.1 4.1 0 0 0-2.7 1.4 3.8 3.8 0 0 0-.9 2.8 3.4 3.4 0 0 0 2.7-1.3Z" /></svg>
							App Store <small>Soon</small>
						</span>
						<span class="store soon" title="Coming soon to Google Play" aria-label="Google Play, coming soon">
							<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4.6 2.8a1.3 1.3 0 0 0-.6 1.1v16.2a1.3 1.3 0 0 0 .6 1.1L13.4 12 4.6 2.8Zm9.9 10.3 2.4 2.4-10.5 6 8.1-8.4Zm3.8-4.7 2.9 1.7a1.1 1.1 0 0 1 0 1.9l-2.9 1.7-2.6-2.7 2.6-2.6ZM6.4 2.5l10.5 6-2.4 2.4-8.1-8.4Z" /></svg>
							Google Play <small>Soon</small>
						</span>
						<a class="store" href={builds + extension} download title="Browser extension for Chrome, Edge and Brave">
							<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4.5a2 2 0 1 1 4 0V6h3.5A1.5 1.5 0 0 1 18 7.5V11h1.5a2 2 0 1 1 0 4H18v3.5a1.5 1.5 0 0 1-1.5 1.5H13v-1.5a2 2 0 1 0-4 0V20H5.5A1.5 1.5 0 0 1 4 18.5V15h1.5a2 2 0 1 0 0-4H4V7.5A1.5 1.5 0 0 1 5.5 6H9V4.5Z" /></svg>
							Extension
						</a>
						<button type="button" class="show-all" onclick={() => open('all')}>Show all</button>
					</div>
				</div>
			</div>
		</div>
	</header>

	<div class="cue" aria-hidden="true" data-cue>
		<span data-hero-after>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
		</span>
	</div>
</section>

<dialog bind:this={dialog} class="chooser" aria-labelledby={view === 'pick' && picks ? 'chooser-title' : undefined} aria-label={view === 'pick' && picks ? undefined : 'All downloads'} onclick={(e) => e.target === dialog && dialog.close()}>
	<div class="chooser-inner">
		<button type="button" class="close" onclick={() => dialog.close()} aria-label="Close">×</button>

		{#if view === 'pick' && computer}
			<!-- The one question for this computer. -->
			<h2 id="chooser-title" class="chooser-title">Hive for {computer.name}</h2>
			<p class="chooser-lede">Which one is this computer for?</p>
			{#if computer.server}
				<div class="options">
					<a class="card option" href={builds + computer.server} download onclick={() => dialog.close()}>
						<span class="option-name">Hive Server</span>
						<span class="option-note">{SERVER_NOTE}</span>
						<span class="option-go">{computer.server} <span aria-hidden="true">↓</span></span>
					</a>
					<a class="card option" href={builds + computer.app} download onclick={() => dialog.close()}>
						<span class="option-name">Hive app</span>
						<span class="option-note">{APP_NOTE}</span>
						<span class="option-go">{computer.app} <span aria-hidden="true">↓</span></span>
					</a>
				</div>
				<p class="hint">Not sure? Set up Hive Server once on a computer that's always on, then install the Hive app on your laptop.</p>
			{:else}
				<div class="card option solo">
					<span class="option-name">Hive Server</span>
					<span class="option-note">{SERVER_NOTE} On Linux, run this one command. There's no Hive app for Linux yet.</span>
					{@render command()}
				</div>
			{/if}
			<button type="button" class="show-all" onclick={() => (view = 'all')}>Show all downloads</button>
		{:else if view === 'pick' && phone === 'iPhone'}
			<!-- Only what fits an iPhone. -->
			<h2 id="chooser-title" class="chooser-title">Hive for iPhone</h2>
			<p class="chooser-lede">Hive isn't in the App Store yet{signed ? '.' : ", so it's installed by sideloading."}</p>
			<div class="options" class:one={!signed}>
				{#if signed}
					<a class="card option" href={install}>
						<span class="option-name">Install Hive</span>
						<span class="option-note">Installs straight onto this iPhone. Only for iPhones the club has registered.</span>
						<span class="option-go">Install <span aria-hidden="true">↓</span></span>
					</a>
				{/if}
				<a class="card option" href={builds + ipa} download onclick={() => dialog.close()}>
					<span class="option-name">Hive</span>
					<span class="option-go">{ipa} <span aria-hidden="true">↓</span></span>
				</a>
			</div>
			<p class="hint">{DEV_MODE}</p>
			<button type="button" class="show-all" onclick={() => (view = 'all')}>Show all downloads</button>
		{:else if view === 'pick' && phone === 'Android'}
			<h2 id="chooser-title" class="chooser-title">Hive for Android</h2>
			<p class="chooser-lede">There's no Android app yet. It's coming to Google Play. Until then, Hive runs on a computer.</p>
			<button type="button" class="show-all" onclick={() => (view = 'all')}>Show all downloads</button>
		{:else}
			<!-- Every download, each with what it's for. -->

			<h3 class="group" id="dl-server">Hive Server <span>{SERVER_NOTE}</span></h3>
			<ul class="files" role="list">
				{#each ['mac', 'windows'] as const as k (k)}
					<li><a class="card file" class:mine={os === k} href={builds + computers[k].server} download>
						<span class="file-name">{computers[k].name}{#if os === k}<span class="mine-tag">This computer</span>{/if}</span>
						<span class="file-get">{computers[k].server} <span aria-hidden="true">↓</span></span>
					</a></li>
				{/each}
				<li class="card file wide" class:mine={os === 'linux'}>
					<span class="file-name">Linux or a cloud server{#if os === 'linux'}<span class="mine-tag">This computer</span>{/if}</span>
					{@render command()}
				</li>
			</ul>

			<h3 class="group" id="dl-app">Hive app <span>{APP_NOTE}</span></h3>
			<ul class="files" role="list">
				{#each ['mac', 'windows'] as const as k (k)}
					<li><a class="card file" class:mine={os === k} href={builds + computers[k].app} download>
						<span class="file-name">{computers[k].name}{#if os === k}<span class="mine-tag">This computer</span>{/if}</span>
						<span class="file-get">{computers[k].app} <span aria-hidden="true">↓</span></span>
					</a></li>
				{/each}
			</ul>

			<h3 class="group" id="dl-browser">Browser extension <span>Lets Hive use your browser. For Chrome, Edge and Brave; on a Mac, Hive for Safari comes inside the Hive app.</span></h3>
			<ul class="files" role="list">
				<li><a class="card file" href={builds + extension} download>
					<span class="file-name">Chrome, Edge, Brave</span>
					<span class="file-get">{extension} <span aria-hidden="true">↓</span></span>
				</a></li>
			</ul>

			<h3 class="group" id="dl-iphone">iPhone <span>Not in the App Store yet{signed && os === 'ios' ? '.' : ": it's installed by sideloading."}</span></h3>
			<ul class="files" role="list">
				{#if signed && os === 'ios'}
					<li><a class="card file mine" href={install}>
						<span class="file-name">Install Hive<span class="mine-tag">This iPhone</span></span>
						<span class="file-get">Install <span aria-hidden="true">↓</span></span>
					</a></li>
				{/if}
				<li><a class="card file" class:mine={os === 'ios' && !signed} href={builds + ipa} download>
					<span class="file-name">Hive</span>
					<span class="file-get">{ipa} <span aria-hidden="true">↓</span></span>
				</a></li>
			</ul>
			<p class="hint">{DEV_MODE}</p>
		{/if}
	</div>
</dialog>

<!-- Slide 3: this semester's plan and the code. -->
<section class="slide hive-plan" aria-labelledby="plan-heading">
	<div class="shell">
		<h2 id="plan-heading" class="slide-title" data-reveal>{project.semesterLabel}</h2>
		<ol class="points" role="list" data-stagger>
			{#each project.semester as point, i (i)}
				<li class="card point" data-reveal>
					<span class="num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
					<p>{point}</p>
				</li>
			{/each}
		</ol>
		<a class="repo" href={project.repoHref} target="_blank" rel="noopener noreferrer" data-reveal>
			{project.repoCta} <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>
		</a>
	</div>
</section>

<style>
	/* ---- download window ---- */
	.chooser {
		width: min(100% - 2rem, 50rem);
		max-height: min(100% - 2rem, 48rem);
		margin: auto;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-lg);
		background: var(--bg);
		color: var(--fg);
		box-shadow: var(--shadow-lift);
	}
	.chooser::backdrop { background: rgb(0 0 0 / 0.6); backdrop-filter: blur(4px); }
	.chooser-inner { position: relative; padding: clamp(1.25rem, 3vw, 2rem); }
	.close { position: absolute; top: 0.75rem; right: 0.75rem; width: 2.4rem; height: 2.4rem; border-radius: 999px; font-size: 1.6rem; line-height: 1; color: var(--muted); }
	.close:hover, .close:focus-visible { color: var(--fg); background: var(--surface-2); }
	.chooser-title { padding-right: 2.5rem; font-family: var(--font-sans); font-size: clamp(1.6rem, 4vw, 2.2rem); font-weight: 900; letter-spacing: -0.03em; line-height: 1.1; }
	.chooser-lede { margin-top: 0.5rem; max-width: 40rem; font-size: 1.05rem; line-height: 1.55; color: var(--muted); }
	.options { display: grid; gap: 0.9rem; margin-top: 1.25rem; }
	@media (min-width: 640px) { .options { grid-template-columns: 1fr 1fr; } .options.one { grid-template-columns: minmax(0, 1fr); } }
	.option { display: flex; flex-direction: column; gap: 0.55rem; padding: clamp(1.1rem, 2.5vw, 1.5rem); text-align: left; transition: border-color 0.2s ease, transform 0.25s var(--ease-spring); }
	a.option:hover, a.option:focus-visible { border-color: var(--accent); transform: translateY(-2px); }
	.option.solo { margin-top: 1.25rem; }
	.option-name { font-family: var(--font-sans); font-size: clamp(1.4rem, 3vw, 1.75rem); font-weight: 900; letter-spacing: -0.03em; }
	.option-note { flex: 1; font-size: 1rem; line-height: 1.5; color: var(--muted); }
	.option-go { margin-top: 0.3rem; font-family: var(--font-sans); font-weight: 700; color: var(--accent); }
	.hint { margin-top: 1rem; font-size: 0.95rem; line-height: 1.5; color: var(--muted); }
	.chooser .show-all { margin: 1rem 0 0; }
	.group { margin-top: 1.6rem; font-family: var(--font-sans); font-size: 1.25rem; font-weight: 900; letter-spacing: -0.02em; scroll-margin-top: 1rem; }
	.group:first-of-type { margin-top: 0; padding-right: 2.5rem; }
	.group span { display: block; margin-top: 0.25rem; font-family: var(--font-body, inherit); font-size: 0.95rem; font-weight: 400; letter-spacing: 0; line-height: 1.5; color: var(--muted); }
	.files { display: grid; gap: 0.65rem; margin-top: 0.75rem; list-style: none; padding: 0; }
	@media (min-width: 560px) { .files { grid-template-columns: 1fr 1fr; } .files .wide { grid-column: 1 / -1; } }
	.file { display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem; height: 100%; padding: 0.95rem 1.15rem; border-radius: var(--r); transition: border-color 0.2s ease; }
	a.file:hover, a.file:focus-visible { border-color: var(--accent); }
	.file.mine { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.file-name { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-family: var(--font-sans); font-size: 1.1rem; font-weight: 800; letter-spacing: -0.02em; }
	.mine-tag { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
	.file-get { font-family: var(--font-sans); font-size: 0.95rem; font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
	.cmd { display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; width: 100%; margin-top: 0.25rem; }
	.cmd code { display: block; width: 100%; padding: 0.6rem 0.8rem; border-radius: 0.5rem; background: var(--bg); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; overflow-wrap: anywhere; user-select: all; }

	/* ---- slide 1 ---- */
	.hive-hero { overflow: clip; }
	.hero-inner { transform-origin: 50% 40%; }
	.title {
		margin-top: 0.25rem;
		font-family: var(--font-sans);
		font-size: clamp(4.5rem, min(21vw, 24svh), 13rem);
		font-weight: 900;
		line-height: 0.88;
		letter-spacing: -0.05em;
		text-transform: uppercase;
		color: var(--fg);
	}
	.word { display: inline-block; }
	.goal {
		margin-top: clamp(1rem, 3.5svh, 2rem);
		max-width: 58rem;
		font-family: var(--font-sans);
		font-size: clamp(1.3rem, min(2.5vw, 4.2svh), 2.1rem);
		font-weight: 500;
		line-height: 1.3;
		letter-spacing: -0.015em;
		color: var(--fg);
	}
	.goal :global(strong) { font-weight: 800; }
	/* One centred column, the way Raycast, Linear and Notion lay out their download pages: name, what it does,
	   then the download right under it, with the other platforms small beneath. */
	.hero-grid { display: flex; flex-direction: column; align-items: center; text-align: center; }
	.hero-copy { display: flex; flex-direction: column; align-items: center; min-width: 0; }
	/* Even line lengths at every width, so the last line is never a few stray words. */
	.hero-copy .goal { max-width: 50rem; text-wrap: balance; }
	/* Name, line and download all fit above the scroll arrow, even on a short laptop screen. */
	.hero-copy .title { display: flex; align-items: center; justify-content: center; gap: 0.12em; font-size: clamp(4rem, min(18vw, 22svh), 13rem); }
	.hero-copy .goal { font-size: clamp(1.3rem, min(2.5vw, 3.6svh), 2.1rem); }
	/* The icon is drawn with padding around its tile, so it sits a little taller than the letters. */
	.hive-logo { width: 1em; height: 1em; flex: none; filter: drop-shadow(0 14px 28px rgb(240 180 58 / 0.18)); }
	.title { transform-origin: 50% 50%; }
	.get-panel { margin-top: clamp(1.5rem, 4.5svh, 2.75rem); }
	.get-hive { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
	.get-hive .get-more { justify-content: center; }
	.get-btn { min-height: 3.5rem; padding-inline: 1.9rem; font-size: 1.15rem; }
	.get-more { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; }
	.store { display: inline-flex; align-items: center; gap: 0.4rem; height: 2.1rem; padding: 0 0.75rem; border-radius: 999px; border: 1.5px solid var(--line-strong); font-family: var(--font-sans); font-size: 0.85rem; font-weight: 700; color: var(--fg); transition: border-color 0.2s ease; }
	a.store:hover, a.store:focus-visible { border-color: var(--fg); }
	.store.soon { color: var(--faint); border-style: dashed; cursor: default; }
	.store small { font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
	.show-all { margin-left: 0.35rem; font-family: var(--font-sans); font-weight: 700; color: var(--accent); }
	.show-all:hover, .show-all:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
	.cue {
		position: absolute;
		inset-inline: 0;
		bottom: clamp(0.75rem, 4svh, 2rem);
		width: fit-content;
		margin-inline: auto;
		color: var(--muted);
	}
	.cue span { display: block; animation: nudge 2.4s ease-in-out infinite; }
	@keyframes nudge {
		0%, 100% { transform: translateY(0); opacity: 0.6; }
		50% { transform: translateY(6px); opacity: 1; }
	}

	/* ---- plan slide ---- */
	.points {
		display: grid;
		gap: clamp(0.75rem, 1.6svh, 1rem);
		margin-top: clamp(1.1rem, 3.5svh, 2.25rem);
		list-style: none;
		padding: 0;
	}
	@media (min-width: 700px) { .points { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.point {
		display: flex;
		flex-direction: column;
		gap: clamp(0.5rem, 1.6svh, 1rem);
		min-width: 0;
		padding: clamp(1.1rem, min(2vw, 3.2svh), 1.75rem);
	}
	.point:first-child { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.num {
		font-family: var(--font-sans);
		font-size: clamp(1.9rem, min(3.4vw, 6svh), 3.1rem);
		font-weight: 900;
		line-height: 0.85;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
		color: var(--accent);
	}
	.point p { font-size: clamp(1rem, min(1.4vw, 2.5svh), 1.25rem); line-height: 1.5; color: var(--fg); }
	.repo { display: inline-block; margin-top: clamp(0.9rem, 2.4svh, 1.4rem); font-family: var(--font-sans); font-size: 1.05rem; font-weight: 700; color: var(--accent); }
	.repo:hover, .repo:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

	@media (prefers-reduced-motion: reduce) {
		.cue span { animation: none; }
	}
</style>
