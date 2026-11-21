<script lang="ts">
	import type { Snippet } from 'svelte';
	import { backdropClose, opensDialog } from '$lib/actions.js';

	let { id, name, count, children }: { id: string; name: string; count: number; children: Snippet } = $props();
</script>

<div class="members-control">
	<button type="button" class="btn small" aria-haspopup="dialog" aria-controls={id} data-members-dialog={id} use:opensDialog={id}>
		Members ({count})
	</button>
	<dialog {id} class="members-dialog" aria-labelledby="{id}-title" use:backdropClose>
		<div class="members-dialog-content">
			<header>
				<h2 id="{id}-title">{name} members</h2>
				<!-- svelte-ignore a11y_autofocus -->
				<form method="dialog"><button class="btn small" autofocus>Close</button></form>
			</header>
			{@render children()}
		</div>
	</dialog>
</div>
