<script lang="ts">
	/**
	 * Club mark — the Agentic AI UW logo (static/logo.png).
	 */
	interface Props { class?: string; title?: string }
	let { class: klass = '', title = 'Agentic AI UW' }: Props = $props();
</script>

<img class={klass} src="/logo.png" alt={title} width="1254" height="1254" />
