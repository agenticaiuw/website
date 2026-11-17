<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import Robot from './Robot.svelte';
	import Badge from './Badge.svelte';
	import { site } from '$lib/site';
	const { work } = site();

	const teams = work.subteams.items;
	const WIDE = 780;
	const DWELL = 5000;
	type RobotController = {
		setVisible: (visible: boolean) => void;
		refresh: () => void;
		dispose: () => void;
	};

	let active = $state(0);
	let manualSelection = $state(0);
	let pointerPaused = $state(false);
	let focusPaused = $state(false);
	let wide = $state(false);
	let reduced = $state(false);
	let pageHidden = $state(false);
	let inView = $state(false);
	let held = $state(false);
	/* Arriving from a board card link holds that team until the visitor picks another. */
	let pinned = $state(false);
	let hasPresented = false;
	let cardVisible = $state(false);
	let engine = $state<'loading' | 'spline' | 'fallback'>('loading');
	let fail = $state<string | null>(null);
	let anchor = $state<{ x: number; y: number } | null>(null);
	let stage = $state<HTMLElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let stageSize = $state(760);
	let radius = $state(336);
	let controller = $state<RobotController | null>(null);
	let current = $derived(teams[active]);

	function go(i: number, manual = true) {
		active = ((i % teams.length) + teams.length) % teams.length;
		if (manual) {
			manualSelection += 1;
			pinned = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			go(active + 1);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			go(active - 1);
		}
	}

	function onFocusOut(e: FocusEvent) {
		const group = e.currentTarget as HTMLElement;
		focusPaused = e.relatedTarget instanceof Node && group.contains(e.relatedTarget);
	}

	onMount(() => {
		const mq = window.matchMedia(`(min-width: ${WIDE}px)`);
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const onMq = () => {
			wide = mq.matches;
			// Removing the desktop controls does not always dispatch leave/blur.
			// Clear their pause flags so a later desktop layout can rotate again.
			if (!wide) {
				pointerPaused = false;
				focusPaused = false;
			}
		};
		const onMotion = () => (reduced = motion.matches);
		const onVisibility = () => (pageHidden = document.hidden);
		onMq();
		onMotion();
		onVisibility();

		/* /teams/#team-<k> (linked from the board cards) opens on that team. The
		   layout swaps once `wide` is known, so scroll after it has settled. */
		const linked = teams.findIndex((t) => `#team-${t.k}` === location.hash);
		if (linked >= 0) {
			go(linked);
			pinned = true;
			tick().then(() => requestAnimationFrame(() => document.getElementById(`team-${teams[linked].k}`)?.scrollIntoView({ block: 'start' })));
		}
		mq.addEventListener('change', onMq);
		motion.addEventListener('change', onMotion);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			mq.removeEventListener('change', onMq);
			motion.removeEventListener('change', onMotion);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	/* A fresh dwell begins only after the hands settle, and after any interaction.
	   Hidden tabs and offscreen sections never advance the selected team. */
	$effect(() => {
		active;
		manualSelection;
		if (!wide || !held || !inView || pinned || pointerPaused || focusPaused || pageHidden || reduced) return;
		const timer = setTimeout(() => go(active + 1, false), DWELL);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!wide || !stage) return;
		const element = stage;
		const measure = () => {
			const bounds = element.getBoundingClientRect();
			stageSize = bounds.width;
			radius = Math.max(0, bounds.width / 2 - 44);
			untrack(() => controller?.refresh());
		};
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(element);
		const intersection = new IntersectionObserver(
			([entry]) => (inView = entry.isIntersecting && entry.intersectionRatio >= 0.2),
			{ threshold: [0, 0.2] }
		);
		intersection.observe(element);
		return () => {
			resize.disconnect();
			intersection.disconnect();
			inView = false;
		};
	});

	/* The Spline controller owns the authored opening, its final pose, and the
	   head motion. The component owns visibility, selection, and HTML geometry. */
	$effect(() => {
		if (!wide || !canvas || !stage) return;
		const canvasElement = canvas;
		const stageElement = stage;
		let disposed = false;
		let instance: RobotController | null = null;
		held = false;
		cardVisible = false;
		fail = null;
		engine = 'loading';
		anchor = null;

		(async () => {
			try {
				const { createSubteamRobot } = await import('$lib/animation/subteamRobot');
				if (disposed) return;
				instance = await createSubteamRobot({
					canvas: canvasElement,
					stage: stageElement,
					getActive: () => active,
					getReducedMotion: () => reduced,
					skipOpening: hasPresented,
					onReady: () => {
						if (!disposed) engine = 'spline';
					},
					onReveal: () => {
						if (!disposed) cardVisible = true;
					},
					onHeld: () => {
						if (!disposed) {
							hasPresented = true;
							held = true;
							cardVisible = true;
						}
					},
					onAnchor: (p: { x: number; y: number }) => {
						if (!disposed) anchor = p;
					}
				});
				if (disposed) {
					instance.dispose();
					return;
				}
				controller = instance;
			} catch (error) {
				if (disposed) return;
				fail = error instanceof Error ? error.message : String(error);
				console.warn('[SubteamOrbit] Spline unavailable, using fallback:', error);
				engine = 'fallback';
				held = true;
				cardVisible = true;
				stageElement.dataset.robotPhase = 'fallback';
			}
		})();

		return () => {
			disposed = true;
			instance?.dispose();
			controller = null;
		};
	});

	$effect(() => {
		controller?.setVisible(inView && !pageHidden);
	});

	$effect(() => {
		active;
		reduced;
		controller?.refresh();
	});
</script>

{#if wide}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="subteam-interactive"
		role="group"
		aria-label="Subteams. Use the left and right arrow keys to choose a team."
		onpointerenter={() => (pointerPaused = true)}
		onpointerleave={() => (pointerPaused = false)}
		onfocusin={() => (focusPaused = true)}
		onfocusout={onFocusOut}
		onkeydown={onKey}
	>
		{#each teams as t (t.k)}<span id="team-{t.k}" class="team-anchor"></span>{/each}
		<div class="orbit" bind:this={stage} data-held={held} data-active={current.k}>
			<div class="bot" class:ready={engine !== 'loading'} data-engine={engine} data-fail={fail}>
				{#if engine === 'fallback'}
					<Robot />
				{:else}
					<canvas bind:this={canvas} aria-hidden="true"></canvas>
				{/if}
			</div>

			{#each teams as t, i (t.k)}
				{@const angle = -Math.PI / 2 + (i / teams.length) * Math.PI * 2}
				<button
					class="avatar"
					class:active={i === active}
					style:left="{stageSize / 2 + radius * Math.cos(angle)}px"
					style:top="{stageSize / 2 + radius * Math.sin(angle)}px"
					onclick={() => go(i)}
					aria-label={t.name}
					aria-current={i === active}
				>
					<span class="ring"><Badge size={46} prop={t.k} sticker={false} /></span>
					<span class="tag">{t.short}</span>
				</button>
			{/each}

			<!-- Every card contributes to the grid's height. The hands therefore
			     support one stable rectangle even when longer descriptions appear. -->
			<div
				class="bubble"
				class:held={cardVisible}
				style:left="{anchor?.x ?? stageSize / 2}px"
				style:top="{anchor?.y ?? stageSize * 0.55}px"
				aria-hidden={!cardVisible}
			>
				<div class="bubble-in">
					{#each teams as t, i (t.k)}
						<div class="bubble-content" class:visible={i === active} aria-hidden={i !== active || !cardVisible}>
							<p class="bubble-name">{t.name}</p>
							<p class="line">{t.line}</p>
							<p class="lead"><span class="dot"></span>Led by {t.lead}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="dots" role="group" aria-label="Choose a subteam">
			{#each teams as t, i (t.k)}
				<button
					class="dot-btn"
					class:on={i === active}
					onclick={() => go(i)}
					aria-pressed={i === active}
					aria-label={t.name}
				></button>
			{/each}
		</div>
	</div>
{:else}
	<!-- No orbit and no 3D on a phone: every subteam readable at once. -->
	<ul class="stack">
		{#each teams as t (t.k)}
			<li id="team-{t.k}" class="scroll-mt-24">
				<div class="row">
					<span class="ring sm"><Badge size={52} prop={t.k} sticker={false} /></span>
					<div class="min-w-0">
						<p class="team-name">{t.name}</p>
						<p class="lead-sm">{t.lead}</p>
					</div>
				</div>
				<p class="line">{t.line}</p>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.subteam-interactive { scroll-margin-top: 90px; position: relative; }
	.team-anchor { position: absolute; top: 0; scroll-margin-top: 90px; }
	/* ---------- orbit ---------- */
	.orbit {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
		max-width: 760px;
		aspect-ratio: 1;
		margin-inline: auto;
	}

	.bot {
		position: absolute;
		/* A square canvas leaves the original gesture room on every side.
		   The controller fits the full visible mesh inside the button circle. */
		inset: 0;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.6s ease;
	}
	.bot.ready {
		opacity: 1;
	}
	.bot canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* ---------- orbiting avatars ---------- */
	.avatar {
		position: absolute;
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		transform: translate(-50%, -50%);
		z-index: 6;
		cursor: pointer;
		background: none;
		border: 0;
		padding: 0;
	}
	.ring {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 999px;
		border: 3px solid var(--line-strong);
		background: var(--cream);
		overflow: hidden;
		transition:
			border-color 0.3s ease,
			box-shadow 0.4s ease,
			transform 0.3s var(--ease-out-expo);
	}
	.ring.sm {
		flex-shrink: 0;
		width: 60px;
		height: 60px;
		border-width: 2px;
		border-radius: 18px;
	}
	.tag {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 50%;
		transform: translateX(-50%);
		padding: 0.1rem 0.6rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1px solid var(--line-strong);
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		line-height: 1.35;
		color: var(--muted);
		width: max-content;
		max-width: 9rem;
		text-align: center;
	}

	.avatar:hover .ring {
		transform: scale(1.08);
		border-color: var(--accent);
	}
	.avatar:focus-visible .ring {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	/* Dark: a genuine emitted halo. */
	.avatar.active .ring {
		border-color: var(--red);
		box-shadow: 0 0 0 4px rgb(var(--glow) / 0.25), 0 0 26px 4px rgb(var(--glow) / 0.4);
		transform: scale(1.08);
	}
	.avatar.active .tag {
		background: var(--red);
		border-color: var(--red);
		color: #fff;
	}

	/* ---------- bubble ---------- */
	.bubble {
		position: absolute;
		z-index: 5;
		width: 280px;
		margin-left: -140px;
		transform: translateY(-100%);
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.6s ease;
	}
	.bubble.held {
		opacity: 1;
	}
	.bubble-in {
		display: grid;
		padding: 1rem 1.1rem 1.05rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		box-shadow: var(--shadow-lift);
	}
	.bubble-content {
		grid-area: 1 / 1;
		visibility: hidden;
		opacity: 0;
		transition: opacity 0.25s ease;
	}
	.bubble-content.visible {
		visibility: visible;
		opacity: 1;
	}

	.bubble-name, .team-name {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		line-height: 1.25;
		color: var(--fg);
	}
	.line {
		margin-top: 0.4rem;
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--muted);
	}
	.lead {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.7rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
		font-size: 0.9rem;
		color: var(--muted);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--accent);
	}

	/* ---------- dots ---------- */
	.dots {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1.4rem;
	}
	.dot-btn {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		border: 0;
		padding: 0;
		cursor: pointer;
		background: transparent;
	}
	.dot-btn::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--line-strong);
		transition:
			background 0.25s ease,
			transform 0.25s ease;
	}
	.dot-btn.on::before {
		background: var(--accent);
		transform: scale(1.35);
	}
	.dot-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	/* ---------- stacked ---------- */
	.stack {
		display: grid;
		gap: 0.7rem;
		list-style: none;
		padding: 0;
	}
	.stack li {
		padding: 1.1rem 1.15rem 1.2rem;
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--shadow);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.lead-sm {
		margin-top: 0.1rem;
		font-size: 0.95rem;
		color: var(--muted);
	}
	.stack .line {
		margin-top: 0.7rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble,
		.bubble-content {
			transition: none;
		}
	}
</style>
