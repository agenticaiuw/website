<script lang="ts">
	import type { Role } from '$lib/types';

	/** Execs show as execs on every team; anyone else can be a team's lead. Titles are per team. */
	let { m }: { m: { title: string; role: Role; is_lead: number } } = $props();
</script>

{#if m.title}<span class="muted team-title">{m.title}</span>{/if}
{#if m.role === 'exec'}<span class="tag exec">Exec</span>{:else if m.is_lead}<span class="tag lead">Lead</span>{/if}
