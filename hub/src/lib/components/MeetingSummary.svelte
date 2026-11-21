<script lang="ts">
	import { backdropClose, opensDialog } from '$lib/actions.js';
	import { formatTimestamp } from '$lib/dates';
	import type { Revision } from '$lib/meetings';
	import type { MeetingRow } from '$lib/types';
	import Field from './Field.svelte';
	import Markdown from './Markdown.svelte';

	let { m, revisions, zone }: { m: MeetingRow; revisions: Revision[]; zone: string } = $props();
	const entries = $derived.by(() => {
		const map = new Map<string, Revision[]>();
		for (const revision of revisions) {
			const history = map.get(revision.entry_id) ?? [];
			history.push(revision);
			map.set(revision.entry_id, history);
		}
		return [...map.values()];
	});
</script>

<section class="card meeting-summary" aria-labelledby="summary">
	<div class="agenda-heading">
		<h2 class="section-title" id="summary">Meeting summary</h2>
		<button
			type="button"
			class="icon-btn agenda-add-button"
			aria-label="Add to meeting summary"
			title="Add to meeting summary"
			aria-haspopup="dialog"
			aria-controls="add-summary-dialog"
			data-members-dialog="add-summary-dialog"
			use:opensDialog={'add-summary-dialog'}><span aria-hidden="true">+</span></button
		>
	</div>
	{#if m.notes}<Markdown text={m.notes} />{/if}
	{#if !m.notes && !entries.length}<p class="hint">No meeting summary yet.</p>{/if}
	{#each entries as history (history[0].entry_id)}
		{@const original = history[0]}
		{@const current = history[history.length - 1]}
		<article class="summary-entry">
			<Markdown text={current.body} />
			<p class="hint summary-attribution">
				Added by {original.author_name} · <time datetime={original.created_at}>{formatTimestamp(original.created_at, zone)}</time>
				{#if history.length > 1}
					· Edited by {current.author_name} · <time datetime={current.created_at}>{formatTimestamp(current.created_at, zone)}</time>{/if}
			</p>
			<div class="inline-tools">
				<button
					type="button"
					class="link-btn small"
					aria-haspopup="dialog"
					aria-controls="edit-summary-{current.entry_id}"
					data-members-dialog="edit-summary-{current.entry_id}"
					use:opensDialog={`edit-summary-${current.entry_id}`}>Edit</button
				>
			</div>
			{#if history.length > 1}
				<details class="summary-history">
					<summary class="link-btn small">Edit history</summary>
					{#each history as revision (revision.id)}
						<div class="summary-revision">
							<p class="hint">{revision.version === 1 ? 'Added' : 'Edited'} by {revision.author_name} · <time datetime={revision.created_at}>{formatTimestamp(revision.created_at, zone)}</time></p>
							<Markdown text={revision.body} />
						</div>
					{/each}
				</details>
			{/if}
			<dialog id="edit-summary-{current.entry_id}" class="members-dialog" aria-labelledby="edit-summary-title-{current.entry_id}" use:backdropClose>
				<div class="members-dialog-content stack">
					<header>
						<h2 id="edit-summary-title-{current.entry_id}">Edit summary contribution</h2>
						<form method="dialog"><button class="btn small">Close</button></form>
					</header>
					<form method="post" action="/meetings/{m.id}/summary/{current.entry_id}" class="stack">
						<input type="hidden" name="version" value={current.version} />
						<Field label="Summary"><textarea name="body" rows={5} required maxlength={10000} value={current.body}></textarea></Field>
						<div><button class="btn primary small">Save changes</button></div>
					</form>
				</div>
			</dialog>
		</article>
	{/each}
	<dialog id="add-summary-dialog" class="members-dialog" aria-labelledby="add-summary-title" use:backdropClose>
		<div class="members-dialog-content stack">
			<header>
				<h2 id="add-summary-title">Add to meeting summary</h2>
				<form method="dialog"><button class="btn small">Close</button></form>
			</header>
			<form method="post" action="/meetings/{m.id}/summary" class="stack">
				<Field label="Summary"><textarea name="body" rows={5} required maxlength={10000}></textarea></Field>
				<div><button class="btn primary small">Add to summary</button></div>
			</form>
		</div>
	</dialog>
</section>
