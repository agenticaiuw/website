<script lang="ts">
	import { reasons } from '$lib/content';
</script>

<!-- Home page, under the vision: what sets the club apart. -->
<section id="why" class="scroll-mt-16 border-t py-20 md:py-28" style:border-color="var(--line)" aria-labelledby="why-heading">
	<div class="shell">
		<h2 id="why-heading" data-reveal class="max-w-3xl text-[clamp(1.9rem,4.4vw,3.1rem)]">{reasons.heading}</h2>
		<ol class="mt-10 border-t md:mt-12" style:border-color="var(--line)" role="list" data-stagger>
			{#each reasons.items as r, i (r.title)}
				<li data-reveal class="grid gap-x-8 gap-y-2 border-b py-6 md:grid-cols-[3rem_minmax(0,22rem)_minmax(0,1fr)] md:py-8" style:border-color="var(--line)">
					<span class="index-numeral tabular-nums" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
					<h3 class="text-xl leading-snug font-medium">{r.title}</h3>
					<p class="max-w-xl text-base leading-relaxed" style:color="var(--muted)">
						{r.body}
						{#if r.link}
							<a href={r.link.href} class="ml-1 font-medium whitespace-nowrap hover:underline" style:color="var(--accent)">{r.link.label} →</a>
						{/if}
					</p>
				</li>
			{/each}
		</ol>
	</div>
</section>
