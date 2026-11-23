<script lang="ts">
	import { onMount } from 'svelte';
	import { richHtml, site } from '$lib/site';
	const { project } = site();
	// What people download: GitHub builds each one from the repo's main branch on every push. A Mac build runs on every
	// Mac (Apple silicon and Intel in one file); Linux has one build per kind of processor.
	const builds = 'https://github.com/agenticaiuw-org/hive/releases/download/latest/';
	type Get = { name: string; note: string; file: string; os: string; arch?: string };
	const servers: Get[] = [
		{ name: 'Linux', note: 'Most VMs (Intel and AMD processors)', file: 'hive-server-linux-x86_64', os: 'linux', arch: 'x86' },
		{ name: 'Linux on ARM', note: "ARM VMs, like Oracle Cloud's", file: 'hive-server-linux-aarch64', os: 'linux', arch: 'arm' },
		{ name: 'Mac', note: 'Apple silicon and Intel', file: 'hive-server-macos.zip', os: 'mac' },
		{ name: 'Windows', note: 'Windows 10 and 11', file: 'hive-server-windows.exe', os: 'windows' }
	];
	const devices: Get[] = [
		{ name: 'Mac', note: 'Apple silicon and Intel', file: 'Hive-Mac.dmg', os: 'mac' },
		{ name: 'Windows', note: 'Windows 10 and 11', file: 'hive-windows.exe', os: 'windows' }
	];
	// Each becomes a link once Hive is listed there.
	const soon = [
		{ name: 'Browser extension', href: '' },
		{ name: 'App Store', href: '' },
		{ name: 'Play Store', href: '' }
	];

	// The visitor's computer and processor, so the builds for it come first.
	let os = $state('');
	let arch = $state('');
	onMount(async () => {
		const p = navigator.platform || '';
		const phone = /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (p === 'MacIntel' && navigator.maxTouchPoints > 1);
		os = phone ? '' : /Mac/.test(p) ? 'mac' : /Win/.test(p) ? 'windows' : /Linux/.test(p) ? 'linux' : '';
		arch = /arm|aarch64/i.test(p) ? 'arm' : 'x86';
		const hints = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> } }).userAgentData;
		if (hints) arch = (await hints.getHighEntropyValues(['architecture']).catch(() => ({ architecture: arch }))).architecture === 'arm' ? 'arm' : 'x86';
	});
	// A VM has no browser: one command there fetches the Linux build for its processor.
	const linux = `curl -fLo hive-server ${builds}hive-server-linux-$(uname -m) && chmod +x hive-server && sudo ./hive-server`;
	const mine = (g: Get) => g.os === os && (!g.arch || g.arch === arch);
	const first = (list: Get[]) => [...list].sort((a, b) => Number(mine(b)) - Number(mine(a)));
	const here = $derived(devices.find(mine));
	const slides = $derived([
		{ id: 'server', title: 'Get your Hive', gets: first(servers),
			lede: "The server is your Hive, its own download: run it once on a computer that stays on, a VM or an old laptop. It signs in to ChatGPT with a code, starts with the computer from then on, and gives you your dashboard's link. Then add your devices: each one connects to your Hive with the link from its dashboard's Pair a device." }
	]);
</script>

<!-- Slide 1: the project's name and goal, big, with why it matters and the download for this computer. -->
<section id="hive" class="slide hive-hero scroll-mt-16">
	<header class="shell hero-inner" data-hero>
		<p class="eyebrow accent" data-hero-after>{project.eyebrow}</p>
		<h1 class="title"><span class="word" data-word>{project.title}<span class="title-dot">.</span></span></h1>
		<p class="goal" data-hero-after>{@html richHtml(project.goal)}</p>
		{#if project.why}<p class="why" data-hero-after>{project.why}</p>{/if}
		<div class="get-hive" data-hero-after>
			{#if here}<a class="btn btn-red" href={builds + here.file} download>Download for {here.name} <span aria-hidden="true">↓</span></a>{/if}
			{#each soon as s (s.name)}
				{#if s.href}<a class="btn btn-ghost btn-sm" href={s.href} target="_blank" rel="noopener noreferrer">{s.name}</a>
				{:else}<span class="btn btn-ghost btn-sm soon" aria-disabled="true">{s.name} <small>soon</small></span>{/if}
			{/each}
		</div>
	</header>

	<div class="cue" aria-hidden="true" data-cue>
		<span data-hero-after>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
		</span>
	</div>
</section>

<!-- Slide 2: get the server, this computer's build first. -->
{#each slides as sl (sl.id)}
	<section id={sl.id} class="slide hive-get scroll-mt-16" aria-labelledby="{sl.id}-heading">
		<div class="shell">
			<h2 id="{sl.id}-heading" class="slide-title" data-reveal>{sl.title}</h2>
			<p class="get-lede" data-reveal>{sl.lede}</p>
			<ul class="gets" class:four={sl.gets.length > 3} role="list" data-stagger>
				{#each sl.gets as d (d.file)}
					<li data-reveal>
						<a class="card get" class:mine={mine(d)} href={builds + d.file} download>
							<span class="get-name">{d.name}</span>
							{#if mine(d)}<span class="get-mine">For this computer</span>{/if}
							<span class="get-note">{d.note}</span>
							<span class="get-file">{d.file} <span aria-hidden="true">↓</span></span>
						</a>
					</li>
				{/each}
			</ul>
			{#if sl.id === 'server'}<p class="get-cmd" data-reveal>On a Linux VM, one command gets the build for its processor: <code>{linux}</code></p>{/if}
		</div>
	</section>
{/each}

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
	/* ---- download slide ---- */
	.get-lede { margin-top: clamp(0.6rem, 1.8svh, 1rem); max-width: 46rem; font-size: clamp(1rem, min(1.25vw, 2.3svh), 1.15rem); line-height: 1.6; color: var(--muted); }
	.gets { display: grid; gap: clamp(0.75rem, 1.6svh, 1rem); margin-top: clamp(1.1rem, 3.5svh, 2.25rem); list-style: none; padding: 0; }
	@media (min-width: 700px) { .gets { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.get { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; padding: clamp(1.1rem, min(2vw, 3.2svh), 1.75rem); transition: border-color 0.2s ease; }
	.get:hover, .get:focus-visible { border-color: var(--accent); }
	.get-name { font-family: var(--font-sans); font-size: clamp(1.6rem, min(2.8vw, 5svh), 2.4rem); font-weight: 900; letter-spacing: -0.04em; color: var(--fg); }
	.get-note { flex: 1; font-size: 1rem; line-height: 1.5; color: var(--muted); }
	.get-file { font-family: var(--font-sans); font-weight: 700; color: var(--accent); }
	@media (min-width: 1000px) { .gets.four { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	.get.mine { background: linear-gradient(140deg, var(--accent-surface), var(--surface) 70%); border-color: var(--accent-border); }
	.get-cmd { margin-top: clamp(0.9rem, 2.4svh, 1.4rem); font-size: 0.95rem; line-height: 1.6; color: var(--muted); }
	.get-cmd code { display: block; margin-top: 0.35rem; padding: 0.6rem 0.8rem; border-radius: 0.5rem; background: var(--surface); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; overflow-wrap: anywhere; user-select: all; }
	.get-mine { font-size: 0.8rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }

	/* ---- slide 1 ---- */
	.hive-hero { overflow: clip; }
	.hero-inner { transform-origin: 30% 40%; }
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
	.title-dot { color: var(--accent); }
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
	.why {
		margin-top: clamp(0.9rem, 2.6svh, 1.5rem);
		max-width: 46rem;
		font-size: clamp(1rem, min(1.25vw, 2.3svh), 1.15rem);
		line-height: 1.6;
		color: var(--muted);
	}
	.get-hive { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: clamp(1.1rem, 3.2svh, 2rem); }
	.soon { opacity: 0.55; cursor: default; }
	.soon:hover { transform: none; border-color: var(--line-strong); }
	.soon small { font-size: 0.75em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
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
