<script lang="ts">
	import type { ShownChange } from '$lib/site';

	let { changes }: { changes: ShownChange[] } = $props();
</script>

{#if !changes.length}
	<p class="muted site-nochange">No differences.</p>
{:else}
	<ul class="site-changes">
		{#each changes as ch}
			<li>
				<p class="site-change-label">{ch.label}</p>
				{#if !ch.before}<p class="site-diff"><ins>{ch.after}</ins></p>
				{:else if !ch.after}<p class="site-diff"><del>{ch.before}</del></p>
				{:else}<p class="site-diff">{#each ch.parts as p}{#if p.t === 'same'}{p.s}{:else if p.t === 'del'}<del>{p.s}</del>{:else}<ins>{p.s}</ins>{/if}{/each}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
