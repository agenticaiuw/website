<script lang="ts">
	import { TASK_REPEATS } from '$lib/tasks';
	import Choice from './Choice.svelte';

	let { days, until }: { days: number; until: string | null } = $props();
</script>

<Choice
	name="repeat"
	label="Repeats"
	selected={String(days)}
	options={TASK_REPEATS}
	hint="Weekly ones: on each due date the next one is made and everyone on it is emailed. Daily ones: each day’s is made at midnight and comes in the 9 AM reminder email."
/>
<label class="field until">
	<span class="label">Until</span>
	<input type="date" name="repeat_until" value={until ?? ''} />
	<span class="hint">Optional. Leave it blank to keep going until someone stops it.</span>
</label>
