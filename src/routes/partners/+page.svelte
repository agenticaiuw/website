<script lang="ts">
	import Partners from '$lib/sections/Partners.svelte';
	import PageNav from '$lib/components/PageNav.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import { club } from '$lib/content';
</script>

<Meta title="Partner with us · {club.name}" description="Sponsor {club.name}, bring a real problem to our teams, collaborate on research or speak to our members. Email team@agenticaiuw.com." />

<div class="pt-16">
	<Partners />
	<PageNav />
</div>
