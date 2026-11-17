<script lang="ts">
	import { site } from '$lib/site';
	const { press } = site();
</script>

<!-- On the home page beside the numbers: the story drawn as a newspaper clipping. -->
<a
	class="press-feature"
	href={press.href}
	target="_blank"
	rel="noopener noreferrer"
	aria-labelledby="press-source press-headline"
	aria-describedby="press-credit press-window"
>
	<div class="paper">
		<div class="press-publication" id="press-source">
			<span class="press-eyebrow">{press.eyebrow}</span>
			<span class="press-name">{press.name}</span>
		</div>
		<span class="press-rule" aria-hidden="true"></span>
		<h2 id="press-headline">{press.headline}</h2>
		<p class="press-credit" id="press-credit">
			<span>{press.credit}</span>
			<span class="press-separator" aria-hidden="true">/</span>
			<time datetime={press.date}>{press.dateLabel}</time>
		</p>
	</div>

	<span class="press-action" aria-hidden="true">
		<span>{press.cta}</span>
		<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<path d="M5 19 19 5M5 5h14v14" />
		</svg>
	</span>
	<span class="sr-only" id="press-window">Opens in a new tab.</span>
</a>

<style>
	.press-feature {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(1rem, 3svh, 1.75rem);
		width: 100%;
		max-width: 38rem;
		border-radius: var(--r);
		color: var(--fg);
		text-decoration: none;
	}

	.paper {
		width: 100%;
		padding: clamp(1.1rem, min(3.4vw, 5.2svh), 2.75rem) clamp(1.1rem, 3vw, 2.5rem);
		border-radius: 6px;
		background: var(--cream);
		color: var(--ink);
		text-align: center;
		transform: rotate(-1.2deg);
		box-shadow: 0 40px 70px -36px rgb(0 0 0 / 0.95), 0 12px 24px -16px rgb(0 0 0 / 0.7);
		transition: transform 450ms var(--ease-spring);
	}
	.press-feature:hover .paper,
	.press-feature:focus-visible .paper { transform: rotate(0deg) translateY(-4px); }

	.press-publication { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
	.press-eyebrow {
		font-family: var(--font-sans);
		font-size: clamp(0.78rem, 1.1vw, 0.9rem);
		font-weight: 800;
		letter-spacing: 0.14em;
		line-height: 1.2;
		text-transform: uppercase;
		color: #b3060d;
	}
	.press-name {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(1.6rem, min(3.1vw, 6svh), 3rem);
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.05;
	}
	.press-rule {
		display: block;
		width: 100%;
		height: 6px;
		margin-block: clamp(0.6rem, 2svh, 1.1rem);
		border-top: 2px solid var(--ink);
		border-bottom: 1px solid var(--ink);
	}
	.paper h2 {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(1.15rem, min(2.4vw, 4.4svh), 2.2rem);
		font-weight: 700;
		line-height: 1.16;
		letter-spacing: -0.01em;
		text-wrap: balance;
		color: var(--ink);
	}
	.press-credit {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.3rem 0.55rem;
		margin-top: clamp(0.6rem, 2svh, 1.1rem);
		font-size: 0.92rem;
		line-height: 1.45;
		color: #5d564c;
	}

	.press-action {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 3rem;
		padding: 0.65rem 1.3rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1.5px solid var(--line-strong);
		font-family: var(--font-sans);
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--fg);
		transition: border-color 200ms ease;
	}
	.press-action svg { flex-shrink: 0; color: var(--accent); transition: transform 220ms var(--ease-out-expo); }
	.press-feature:hover .press-action,
	.press-feature:focus-visible .press-action { border-color: var(--fg); }
	.press-feature:hover .press-action svg,
	.press-feature:focus-visible .press-action svg { transform: translate(2px, -2px); }

	@media (prefers-reduced-motion: reduce) {
		.paper, .press-action svg { transition: none; }
		.press-feature:hover .paper,
		.press-feature:focus-visible .paper { transform: rotate(-1.2deg); }
		.press-feature:hover .press-action svg,
		.press-feature:focus-visible .press-action svg { transform: none; }
	}
</style>
