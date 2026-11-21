<script lang="ts">
	import { addRow } from '$lib/actions.js';
	import { bare, formUrl, questionsOf, type FormWithCount } from '$lib/meetings';
	import type { FormQuestion } from '$lib/types';
	import Field from './Field.svelte';

	/** Form details and editing stay in the meeting's Form tab. */
	let { meetingId, f, editable, appUrl }: { meetingId: number; f: FormWithCount | null; editable: boolean; appUrl: string } = $props();
	const base = $derived(`/meetings/${meetingId}/form`);
	const rows: FormQuestion[] = $derived([...(f ? questionsOf(f) : []), { id: '', label: '', kind: 'text' }]);
</script>

<section id="form" class="stack">
	{#if f}
		<div class="card form-box">
			<h2 class="section-title">{f.title} <span class="count">{f.responses}</span></h2>
			{#if f.closed}<p class="hint">Closed. It isn't taking responses.</p>{:else}<p><a href={formUrl(appUrl, f)} data-sveltekit-reload>{bare(formUrl(appUrl, f))}</a></p>{/if}
			{#if editable}<div class="form-actions"><a class="btn primary" href="{base}/screen">Show on screen</a><a class="btn" href="{base}/responses">Responses</a></div>{/if}
		</div>
	{/if}
	{#if editable}
		<form method="post" action={base} class="card form-grid">
			<Field label="Title" wide><input name="title" required maxlength={100} value={f?.title ?? 'Feedback'} /></Field>
			<div class="field wide">
				<span class="label">Questions</span>
				<div class="action-rows" data-rows>
					{#each rows as q}
						<div class="question-row" data-row>
							<input type="hidden" name="qid" value={q.id} />
							<input name="qlabel" value={q.label} maxlength={300} placeholder="Question" aria-label="Question" />
							<select name="qkind" aria-label="Answer"><option value="">Written answer</option><option value="rating" selected={q.kind === 'rating'}>Rating 1–5</option></select>
						</div>
					{/each}
				</div>
				<span class="hint">Name and email are always asked. Clear a question to remove it.</span>
			</div>
			<div class="wide"><button type="button" class="btn ghost" use:addRow>+ Another question</button></div>
			{#if f}<label class="check wide"><input type="checkbox" name="closed" value="1" checked={!!f.closed} /> Closed: stop taking responses</label>{/if}
			<div class="form-actions wide"><button class="btn primary">Save</button></div>
		</form>
	{/if}
</section>
