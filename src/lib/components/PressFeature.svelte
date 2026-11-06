<a
	class="press-feature"
	href="https://www.dailycardinal.com/article/2026/09/agentic-ai-uw-brings-next-step-in-artificial-intelligence-to-uw-madison"
	target="_blank"
	rel="noopener noreferrer"
	aria-labelledby="press-source press-headline"
	aria-describedby="press-credit press-window"
>
	<div class="press-publication" id="press-source">
		<span class="press-eyebrow">Featured in</span>
		<span class="press-name">The Daily Cardinal</span>
		<span class="press-rule" aria-hidden="true"></span>
	</div>

	<div class="press-story">
		<h2 id="press-headline">Agentic AI UW brings the next step in artificial intelligence to campus</h2>
		<p class="press-credit" id="press-credit">
			<span>Campus reporting</span>
			<span class="press-separator" aria-hidden="true">/</span>
			<time datetime="2026-09-03">September 3, 2026</time>
		</p>
	</div>

	<span class="press-action" aria-hidden="true">
		<span>Read the article</span>
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
		grid-template-columns: 12.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: clamp(1.25rem, 2.5vw, 2.5rem);
		padding: 1.6rem 1.75rem;
		border: 1px solid var(--line-strong);
		border-left: 3px solid var(--accent);
		background: color-mix(in oklab, var(--surface) 95%, transparent);
		color: var(--fg);
		text-decoration: none;
		transition: border-color 220ms ease, background-color 220ms ease, transform 220ms var(--ease-out-expo);
		animation: press-appear 550ms var(--ease-out-expo) backwards;
	}

	.press-feature::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 3px;
		background: var(--accent);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 220ms var(--ease-out-expo);
	}

	.press-feature:hover,
	.press-feature:focus-visible {
		border-color: var(--accent);
		background: var(--surface);
		transform: translateY(-2px);
	}

	.press-feature:hover::before,
	.press-feature:focus-visible::before {
		transform: scaleX(1);
	}

	.press-publication {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.55rem;
	}

	.press-eyebrow {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.press-name {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.42rem;
		font-weight: 700;
		letter-spacing: -0.045em;
		line-height: 1.1;
	}

	.press-rule {
		width: 100%;
		height: 4px;
		border-top: 1px solid var(--fg);
		border-bottom: 1px solid var(--line-strong);
	}

	.press-story h2 {
		max-width: 36rem;
		font-size: clamp(1.13rem, 1.9vw, 1.45rem);
		font-weight: 500;
		letter-spacing: -0.025em;
		line-height: 1.3;
		text-wrap: pretty;
	}

	.press-credit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.55rem;
		margin-top: 0.65rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--muted);
	}

	.press-separator { color: var(--line-strong); }

	.press-action {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		font-size: 0.75rem;
		white-space: nowrap;
		color: var(--accent);
	}

	.press-action svg {
		flex-shrink: 0;
		transition: transform 220ms var(--ease-out-expo);
	}

	.press-feature:hover .press-action svg,
	.press-feature:focus-visible .press-action svg {
		transform: translate(2px, -2px);
	}

	@keyframes press-appear {
		from { opacity: 0; transform: translateY(5px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (max-width: 1023px) {
		.press-feature { grid-template-columns: 11.5rem minmax(0, 1fr) auto; padding-inline: 1.35rem; }
		.press-action > span { display: none; }
	}

	@media (max-width: 639px) {
		.press-feature {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 1.1rem 1rem;
			padding: 1.25rem;
		}
		.press-publication { grid-column: 1 / -1; }
		.press-name { font-size: 1.35rem; }
		.press-rule { width: 10.75rem; }
		.press-story h2 { font-size: 1.15rem; }
		.press-action { align-self: start; padding-top: 0.15rem; }
		.press-credit { gap: 0.25rem 0.4rem; font-size: 0.65rem; }
	}

	@media (prefers-reduced-motion: reduce) {
		.press-feature { animation: none; }
		.press-feature,
		.press-feature::before,
		.press-action svg { transition: none; }
		.press-feature:hover,
		.press-feature:focus-visible,
		.press-feature:hover .press-action svg,
		.press-feature:focus-visible .press-action svg { transform: none; }
	}
</style>
