<script lang="ts">
	import { site } from '$lib/site';
	const { press } = site();
</script>

<a
	class="press-feature"
	href={press.href}
	target="_blank"
	rel="noopener noreferrer"
	aria-labelledby="press-source press-headline"
	aria-describedby="press-credit press-window"
>
	<div class="press-publication" id="press-source">
		<span class="press-eyebrow">{press.eyebrow}</span>
		<span class="press-name">{press.name}</span>
		<span class="press-rule" aria-hidden="true"></span>
	</div>

	<div class="press-story">
		<h2 id="press-headline">{press.headline}</h2>
		<p class="press-credit" id="press-credit">
			<span>{press.credit}</span>
			<span class="press-separator" aria-hidden="true">/</span>
			<time datetime={press.date}>{press.dateLabel}</time>
		</p>
	</div>

	<span class="press-action" aria-hidden="true">
		<span>{press.cta}</span>
		<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
			<path d="M5 19 19 5M5 5h14v14" />
		</svg>
	</span>
	<span class="sr-only" id="press-window">Opens in a new tab.</span>
</a>

<style>
	.press-feature {
		position: relative;
		display: grid;
		grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr) auto;
		align-items: center;
		gap: clamp(1.25rem, 2.5vw, 2.25rem);
		padding: 1.25rem 1.5rem 1.25rem 1.25rem;
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		box-shadow: var(--shadow);
		color: var(--fg);
		text-decoration: none;
		transition: border-color 220ms ease, transform 300ms var(--ease-spring), box-shadow 220ms ease;
		animation: press-appear 550ms var(--ease-out-expo) backwards;
	}

	.press-feature:hover,
	.press-feature:focus-visible {
		border-color: var(--line-strong);
		box-shadow: var(--shadow-lift);
		transform: translateY(-3px);
	}

	/* A little cream newspaper tile. */
	.press-publication {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		padding: 0.9rem 1rem 0.85rem;
		border-radius: var(--r);
		background: var(--cream);
		color: var(--ink);
		transform: rotate(-2deg);
		box-shadow: 0 10px 22px -14px rgb(0 0 0 / 0.9);
	}

	.press-eyebrow {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1.2;
		color: #b3060d;
	}

	.press-name {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.15;
	}

	.press-rule {
		width: 100%;
		height: 4px;
		border-top: 1.5px solid var(--ink);
		border-bottom: 1px solid #b9b1a3;
	}

	.press-story h2 {
		max-width: 36rem;
		font-size: clamp(1.2rem, 2vw, 1.5rem);
		font-weight: 700;
		line-height: 1.25;
		text-wrap: pretty;
	}

	.press-credit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.55rem;
		margin-top: 0.5rem;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--muted);
	}

	.press-separator { color: var(--line-strong); }

	.press-action {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 1.1rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1.5px solid var(--line-strong);
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--fg);
		transition: background-color 200ms ease, border-color 200ms ease;
	}

	.press-action svg {
		flex-shrink: 0;
		color: var(--accent);
		transition: transform 220ms var(--ease-out-expo);
	}

	.press-feature:hover .press-action,
	.press-feature:focus-visible .press-action { border-color: var(--fg); }

	.press-feature:hover .press-action svg,
	.press-feature:focus-visible .press-action svg {
		transform: translate(2px, -2px);
	}

	@keyframes press-appear {
		from { opacity: 0; transform: translateY(5px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (max-width: 1023px) {
		.press-action > span { display: none; }
		.press-action { padding: 0.7rem; }
	}

	@media (max-width: 639px) {
		.press-feature {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 1rem;
			padding: 1.1rem;
		}
		.press-publication { grid-column: 1 / -1; justify-self: start; }
		.press-name { font-size: 1.25rem; }
		.press-story h2 { font-size: 1.15rem; }
		.press-action { align-self: start; }
	}

	@media (prefers-reduced-motion: reduce) {
		.press-feature { animation: none; }
		.press-feature,
		.press-action svg { transition: none; }
		.press-feature:hover,
		.press-feature:focus-visible,
		.press-feature:hover .press-action svg,
		.press-feature:focus-visible .press-action svg { transform: none; }
	}
</style>
