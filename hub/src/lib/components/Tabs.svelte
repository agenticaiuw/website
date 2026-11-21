<script lang="ts" generics="T extends string | number">
	/** Links that act as one control, e.g. status or team filters. `href` builds each option's URL. */
	let { options, current, href, label }: { options: [T | null, string][]; current: T | null; href: (value: T | null) => string; label: string } = $props();
</script>

<nav class="seg" aria-label={label}>
	{#each options as [value, text]}
		<a href={href(value)} aria-current={value === current ? 'page' : undefined}>{text}</a>
	{/each}
</nav>
