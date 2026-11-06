<script lang="ts">
	/**
	 * Email address that works in both contexts.
	 *
	 * On the live site it is a plain mailto: link and opens the visitor's mail
	 * app. Inside a sandboxed frame (the artifact preview) top-level navigation
	 * to mailto: is refused and the visitor gets a "content is blocked" page, so
	 * there the click copies the address instead.
	 */
	interface Props { email: string; class?: string; showCopyButton?: boolean }
	let { email, class: klass = '', showCopyButton = true }: Props = $props();

	let copied = $state(false);
	let sandboxed = $state(false);

	$effect(() => {
		try { sandboxed = window.self !== window.top; } catch { sandboxed = true; }
	});

	async function copy() {
		try {
			await navigator.clipboard.writeText(email);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = email;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			ta.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 1800);
	}

	function onClick(e: MouseEvent) {
		if (!sandboxed) return;
		e.preventDefault();
		copy();
	}
</script>

<span class="inline-flex flex-wrap items-center gap-2">
	<a
		href="mailto:{email}"
		onclick={onClick}
		class="underline-offset-4 hover:underline {klass}"
		title={sandboxed ? 'Click to copy (mail links are blocked in this preview)' : `Email ${email}`}
	>
		{email}
	</a>

	{#if showCopyButton}
		<button
			type="button"
			onclick={copy}
			class="grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors"
			style:border-color="var(--line-strong)"
			style:color="var(--muted)"
			aria-label={copied ? 'Email address copied' : 'Copy email address'}
		>
			{#if copied}
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3"
					stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 6 6L20 6" /></svg>
			{:else}
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
					stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
				</svg>
			{/if}
		</button>
	{/if}

	<span class="text-xs" style:color="var(--muted)" aria-live="polite">{copied ? 'Copied' : ''}</span>
</span>
