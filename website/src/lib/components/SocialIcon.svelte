<script lang="ts">
	/** Brand icons. Instagram, Discord and LinkedIn carry brand colour; X inherits currentColor. */
	interface Props { name: string; class?: string }
	let { name, class: klass = 'h-4 w-4' }: Props = $props();
	const id = `ig-${Math.random().toString(36).slice(2, 8)}`;
</script>

{#if name === 'Instagram'}
	<svg class={klass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<defs>
			<radialGradient id={id} cx="0.3" cy="1.05" r="1.3">
				<stop offset="0%" stop-color="#FFD776" />
				<stop offset="24%" stop-color="#F7943E" />
				<stop offset="46%" stop-color="#F14E5E" />
				<stop offset="68%" stop-color="#D62E92" />
				<stop offset="100%" stop-color="#6C4EE3" />
			</radialGradient>
		</defs>
		<rect x="2" y="2" width="20" height="20" rx="5.6" fill="url(#{id})" />
		<rect x="6.1" y="6.1" width="11.8" height="11.8" rx="3.6" fill="none" stroke="#fff" stroke-width="1.7" />
		<circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.7" />
		<circle cx="17.1" cy="6.9" r="1.05" fill="#fff" />
	</svg>
{:else if name === 'Discord'}
	<!-- Filled brand square so it reads at the same visual weight as Instagram
	     and LinkedIn, rather than a bare glyph that looks smaller beside them. -->
	<svg class={klass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<rect x="2" y="2" width="20" height="20" rx="4.2" fill="#5865F2" />
		<path
			transform="translate(5.2 5.2) scale(0.56667)"
			fill="#fff"
			fill-rule="evenodd"
			d="M20.317 4.3697a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.198.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419c0-1.3332.9555-2.4189 2.157-2.4189c1.2108 0 2.1757 1.0952 2.1568 2.419c0 1.3332-.9555 2.4189-2.1569 2.4189zM15.9948 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419c0-1.3332.9554-2.4189 2.1569-2.4189c1.2108 0 2.1757 1.0952 2.1568 2.419c0 1.3332-.946 2.4189-2.1568 2.4189z"
		/>
	</svg>
{:else if name === 'LinkedIn'}
	<!-- Filled brand square so it reads at the same visual weight as Instagram,
	     rather than a bare glyph that looks smaller beside it. -->
	<svg class={klass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<rect x="2" y="2" width="20" height="20" rx="4.2" fill="#0A66C2" />
		<circle cx="7.6" cy="7.8" r="1.75" fill="#fff" />
		<rect x="6.1" y="10.4" width="3" height="8.1" fill="#fff" />
		<path d="M11.4 10.4h2.85v1.12a3.1 3.1 0 0 1 2.72-1.4c2.6 0 3.33 1.72 3.33 3.96v4.42h-3v-3.92c0-.94 0-2.14-1.33-2.14s-1.53 1.04-1.53 2.07v3.99h-3.04v-8.1Z" fill="#fff" />
	</svg>
{:else if name === 'X'}
	<span class="x-logo {klass}" aria-hidden="true"></span>
{/if}

<style>
	.x-logo {
		display: inline-block;
		flex-shrink: 0;
		background-color: currentColor;
		/* The supplied image includes transparent side margins. Its mark fills
		   the same inset as the other icons at this scale, in either theme. */
		-webkit-mask: url('/images/x-logo.png') center / 138% auto no-repeat;
		mask: url('/images/x-logo.png') center / 138% auto no-repeat;
	}
</style>
