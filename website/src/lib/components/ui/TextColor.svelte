<script lang="ts">
	let { words = ['Learn.', 'Build.', 'Belong.'] }: { words?: string[] } = $props();
</script>

<span class="color-words">
	{#each words as word, i}
		<span class="word">{word}<span aria-hidden="true" class="color" style:animation-delay="{i * 2.667}s">{word}</span></span>
	{/each}
</span>

<style>
	.color-words { display: flex; flex-wrap: wrap; gap: 0.2em; }
	.word { position: relative; }
	.color { position: absolute; inset: 0; color: transparent; background: linear-gradient(105deg, var(--accent), var(--accent-bright)); background-clip: text; -webkit-background-clip: text; opacity: 0; animation: color-cycle 8s infinite; }
	@keyframes color-cycle { 0%, 28%, 100% { opacity: 0; } 8%, 20% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .color { animation: none; } }
</style>
