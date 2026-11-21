<script lang="ts">
	import { submitOnSelect } from '$lib/actions.js';
	import { BOARD_STATUSES, type BoardStatus } from '$lib/board';

	let { action, status, title, version = undefined, back }: { action: string; status: BoardStatus; title: string; version?: number; back: string } = $props();
</script>

<form method="post" {action} class="board-move" data-board-move use:submitOnSelect>
	<input type="hidden" name="back" value={back} />
	{#if version !== undefined}<input type="hidden" name="version" value={version} />{/if}
	<span class={status === 'done' ? 'done-stage-control' : undefined}>
		{#if status === 'done'}<span class="tick on done-mark" role="img" aria-label="Done" title="Done"></span>{/if}
		<select name="status" aria-label="Stage for {title}{status === 'done' ? ' (Done)' : ''}" title={status === 'done' ? 'Change task stage' : undefined}>
			{#each BOARD_STATUSES as [value, label]}<option {value} selected={status === value}>{label}</option>{/each}
		</select>
	</span>
	<button class="btn small js-hide">Move</button>
</form>
