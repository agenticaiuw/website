<script lang="ts">
	import { backdropClose, fileLimit, opensDialog } from '$lib/actions.js';
	import { canWrite, FILE_TYPES, type Content } from '$lib/meetings';
	import { canEditMeeting } from '$lib/perm';
	import type { MeetingRow, Viewer } from '$lib/types';
	import Field from './Field.svelte';
	import FileList from './FileList.svelte';
	import Markdown from './Markdown.svelte';
	import PostButton from './PostButton.svelte';

	let { m, viewer, content, zone, ended }: { m: MeetingRow; viewer: Viewer; content: Content; zone: string; ended: boolean } = $props();
	const root = $derived(`/meetings/${m.id}`);
	const agenda = $derived(content.agenda.filter((a) => !a.removed));
	const editor = $derived(canEditMeeting(viewer, m));
	const writable = (file: { author_id: number | null }) => canWrite(viewer, file.author_id);
</script>

<section class="meeting-agenda" aria-label="Agenda" id="agenda">
	<div class="agenda-heading">
		<h2 class="section-title">Agenda</h2>
		{#if !ended}<button type="button" class="btn small" aria-haspopup="dialog" aria-controls="add-agenda-dialog" data-members-dialog="add-agenda-dialog" use:opensDialog={'add-agenda-dialog'}>+ Add item</button>{/if}
	</div>
	{#if m.agenda.trim()}<Markdown text={m.agenda} />{/if}
	{#if !agenda.length && !m.agenda.trim()}<p class="hint">No agenda items yet.</p>{/if}
	{#if agenda.length > 0}
		<ol class="stack agenda-items">
			{#each agenda as item, i (item.id)}
				{@const path = `${root}/agenda/${item.id}`}
				{@const files = content.files.filter((f) => f.agenda_id === item.id)}
				{@const hasNotes = !!item.body?.trim()}
				{#snippet row()}
					<span class="agenda-number" aria-hidden="true">{i + 1}.</span>
					<span class="agenda-row-text"><strong class="agenda-item-title">{item.title}</strong>{#if item.author_name?.trim()}<span class="agenda-author">{item.author_name}</span>{/if}</span>
					{#if item.duration_minutes > 0}<span class="agenda-duration">~{item.duration_minutes} min</span>{/if}
					{#if hasNotes || files.length > 0}<svg class="agenda-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>{/if}
				{/snippet}
				<li class="agenda-item">
					<div class="agenda-item-layout">
						{#if hasNotes || files.length > 0}
							<details class="agenda-expand">
								<summary class="agenda-row">{@render row()}</summary>
								<div class="agenda-notes">
									{#if hasNotes}<Markdown text={item.body ?? ''} />{/if}
									{#if files.length > 0}
										<p class="agenda-files-label">Attachments</p>
										<FileList meetingId={m.id} {files} {writable} {zone} />
									{/if}
								</div>
							</details>
						{:else}
							<div class="agenda-row agenda-static">{@render row()}</div>
						{/if}
						{#if canWrite(viewer, item.author_id)}
							<button
								type="button"
								class="btn small agenda-edit"
								aria-label="Edit {item.title}"
								aria-haspopup="dialog"
								aria-controls="agenda-edit-{item.id}"
								data-members-dialog="agenda-edit-{item.id}"
								use:opensDialog={`agenda-edit-${item.id}`}>Edit</button
							>
						{/if}
					</div>
					{#if canWrite(viewer, item.author_id)}
						<dialog id="agenda-edit-{item.id}" class="members-dialog" aria-labelledby="agenda-edit-{item.id}-title" use:backdropClose>
							<div class="members-dialog-content stack">
								<header>
									<h2 id="agenda-edit-{item.id}-title">Edit agenda item</h2>
									<form method="dialog"><button type="submit" class="icon-btn" aria-label="Close" title="Close">×</button></form>
								</header>
								<form class="stack" method="post" action={path}>
									<input type="hidden" name="version" value={item.version} />
									<Field label="Title"><input name="title" maxlength={200} required value={item.title} /></Field>
									<Field label="Duration (minutes)"><input type="number" name="duration_minutes" required min={1} max={1440} step={1} value={item.duration_minutes} /></Field>
									<div><button class="btn small primary">Save item</button></div>
								</form>
								<form class="stack" method="post" action="{path}/notes">
									<input type="hidden" name="version" value={item.note_version ?? 0} />
									<Field label="Speaker notes"><textarea name="notes" maxlength={10000} rows={3} value={item.body ?? ''}></textarea></Field>
									<div><button class="btn small">Save notes</button></div>
								</form>
								{#if files.length > 0}<FileList meetingId={m.id} {files} {writable} {zone} />{/if}
								<form class="inline-tools" method="post" enctype="multipart/form-data" action="{root}/files">
									<input type="hidden" name="agenda" value={item.id} />
									<input type="file" name="file" aria-label="Attachments" multiple required use:fileLimit />
									<button class="btn small">Upload files</button>
								</form>
								<div class="inline-tools">
									{#if editor && i > 0}<PostButton action="{path}/up" label="Move up" cls="btn small" name="version" value={String(item.version)} />{/if}
									<PostButton action="{path}/remove" label="Remove item" removeLabel="Remove {item.title}" name="version" value={String(item.version)} confirm="Remove this agenda item? Its notes and files will stay with the meeting." />
								</div>
							</div>
						</dialog>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
	{#if !ended}
		<dialog id="add-agenda-dialog" class="members-dialog" aria-labelledby="add-agenda-title" use:backdropClose>
			<div class="members-dialog-content stack">
				<header>
					<h2 id="add-agenda-title">Add agenda item</h2>
					<form method="dialog"><button class="icon-btn" aria-label="Close" title="Close" type="submit">×</button></form>
				</header>
				<form class="stack" method="post" enctype="multipart/form-data" action="{root}/agenda">
					<Field label="Title"><input name="title" maxlength={200} required /></Field>
					<Field label="Duration (minutes)"><input type="number" name="duration_minutes" required min={1} max={1440} step={1} value={2} /></Field>
					<Field label="Speaker notes"><textarea name="notes" maxlength={10000} rows={2}></textarea></Field>
					<Field label="Attachments (optional)" hint="PDF, Word, PowerPoint, Excel, text, images or audio. Up to 8 MiB combined.">
						<input type="file" name="file" multiple accept={FILE_TYPES} use:fileLimit />
					</Field>
					<div><button class="btn small primary">Save item</button></div>
				</form>
			</div>
		</dialog>
	{/if}
</section>
