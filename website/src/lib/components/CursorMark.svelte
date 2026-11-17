<script lang="ts">
	/**
	 * Club mark: the Agentic AI UW logo (static/logo.png), black glove on its
	 * white background. The white is part of the logo, so it is never recolored.
	 */
	interface Props { class?: string; title?: string; size?: number }
	let { class: klass = '', title = '', size = 36 }: Props = $props();
</script>

<img
	class="mark {klass}"
	src="/logo-192.png"
	alt={title}
	aria-hidden={title ? undefined : 'true'}
	width={size}
	height={size}
	style:width="{size}px"
	style:height="{size}px"
/>

<style>
	.mark {
		display: block;
		flex-shrink: 0;
		border-radius: 24%;
		background: #fff;
		box-shadow: 0 8px 18px -10px rgb(0 0 0 / 0.9);
		transition: transform 0.35s var(--ease-spring);
	}
</style>
