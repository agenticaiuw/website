<script lang="ts">
	import { backdropClose, fileLimit, libraryFilters, opensDialog, tabs } from '$lib/actions.js';
	import { fileKind } from '$lib/files';
	import { canWrite, FILE_TYPES, type Content } from '$lib/meetings';
	import type { MeetingRow, Viewer } from '$lib/types';
	import Field from './Field.svelte';
	import FileList from './FileList.svelte';
	import Markdown from './Markdown.svelte';

	let { m, viewer, content, zone }: { m: MeetingRow; viewer: Viewer; content: Content; zone: string } = $props();
	const canUpload = $derived(canWrite(viewer, viewer.id));
	const authors = $derived(
		[...new Map(content.files.map((file) => [file.author_id === null ? 'unknown' : String(file.author_id), file.author_name ?? 'Unknown'])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
	);
	const kinds = $derived([...new Set(content.files.map((file) => (file.url ? 'Link' : fileKind(file.original_name))))].sort());
	const writable = (file: { author_id: number | null }) => canWrite(viewer, file.author_id);
</script>

<section id="files" class="card meeting-library" aria-labelledby="library-title">
	<div class="agenda-heading library-heading">
		<h2 id="library-title" class="section-title">Library</h2>
		{#if canUpload}<button type="button" class="btn small" aria-haspopup="dialog" aria-controls="add-library-file" data-members-dialog="add-library-file" use:opensDialog={'add-library-file'}>+ Add file or link</button>{/if}
	</div>
	{#each content.agenda.filter((item) => item.removed && item.body) as item (item.id)}
		<div class="card"><strong>{item.title}</strong><Markdown text={item.body ?? ''} /></div>
	{/each}
	{#if content.files.length > 0}
		<div class="library-filters" use:libraryFilters>
			<label
				>Added by <select data-library-author-filter data-person
					><option value="">Everyone</option>{#each authors as [value, name]}<option {value}>{name}</option>{/each}</select
				></label
			>
			<label
				>Type <select data-library-type-filter
					><option value="">All types</option>{#each kinds as kind}<option value={kind}>{kind}</option>{/each}</select
				></label
			>
		</div>
		<FileList meetingId={m.id} files={content.files} {zone} {writable} />
		<p class="hint" data-library-no-results hidden>No items match these filters.</p>
	{:else}
		<p class="hint">No files yet.</p>
	{/if}
	{#if canUpload}
		<dialog id="add-library-file" class="members-dialog" aria-labelledby="add-library-file-title" use:backdropClose>
			<div class="members-dialog-content stack">
				<header>
					<h2 id="add-library-file-title">Add file to library</h2>
					<form method="dialog"><button type="submit" class="icon-btn" aria-label="Close" title="Close">×</button></form>
				</header>
				<div data-library-tabs use:tabs>
					<div class="seg library-add-tabs" role="tablist" aria-label="Library item type">
						<button type="button" role="tab" id="library-file-tab" aria-controls="library-file-panel" aria-selected="true" tabindex={0}>Add file</button>
						<button type="button" role="tab" id="library-link-tab" aria-controls="library-link-panel" aria-selected="false" tabindex={-1}>Add link</button>
					</div>
					<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
					<form id="library-file-panel" role="tabpanel" aria-labelledby="library-file-tab" class="stack" method="post" enctype="multipart/form-data" action="/meetings/{m.id}/files">
						<Field label="Name"><input name="name" required maxlength={200} /></Field>
						<Field label="File" hint="PDF, Word, PowerPoint, Excel, text, images or audio. Up to 8 MiB."><input type="file" name="file" required accept={FILE_TYPES} use:fileLimit /></Field>
						<div><button class="btn small primary">Save</button></div>
					</form>
					<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
					<form id="library-link-panel" role="tabpanel" aria-labelledby="library-link-tab" hidden class="stack" method="post" action="/meetings/{m.id}/library-links">
						<Field label="Name"><input name="name" required maxlength={200} /></Field>
						<Field label="Link"><input type="url" name="url" required maxlength={2048} placeholder="https://example.com" /></Field>
						<div><button class="btn small primary">Save</button></div>
					</form>
				</div>
			</div>
		</dialog>
	{/if}
</section>
