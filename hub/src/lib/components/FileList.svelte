<script lang="ts">
	import { fileKind } from '$lib/files';
	import type { Attachment } from '$lib/meetings';
	import PostButton from './PostButton.svelte';

	let { meetingId, files, writable, zone }: { meetingId: number; files: Attachment[]; writable: (file: Attachment) => boolean; zone: string } = $props();

	const icon = (kind: string) =>
		kind === 'Link' ? '↗' : kind === 'Image' ? '▧' : kind === 'Audio' ? '♫' : kind === 'PowerPoint' ? 'P' : kind === 'Word document' ? 'W' : kind === 'Excel spreadsheet' ? 'X' : kind === 'PDF' ? 'PDF' : '≡';
	const when = $derived(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }));
</script>

<ul class="att-list library-list">
	{#each files as file (file.id)}
		{@const path = `/meetings/${meetingId}/${file.url ? 'library-links' : 'files'}/${file.id}`}
		{@const kind = file.url ? 'Link' : fileKind(file.original_name)}
		<li class="library-file" data-library-item data-library-type={kind} data-library-author={file.author_id === null ? 'unknown' : String(file.author_id)}>
			<span class="library-icon" aria-hidden="true">{icon(kind)}</span>
			<div class="library-file-info">
				<a href={file.url ?? path} target={file.url ? '_blank' : undefined} rel={file.url ? 'noopener noreferrer' : undefined} data-sveltekit-reload>{file.name}</a>
				<span class="hint"
					>{kind} · Added by {file.author_name ?? 'Unknown'} · {#if file.created_at}<time datetime={file.created_at}>{when.format(new Date(file.created_at))}</time>{:else}Date unknown{/if}</span
				>
			</div>
			{#if file.media_type.startsWith('audio/')}<audio controls preload="none" src="{path}?play=1"></audio>{/if}
			{#if writable(file)}<PostButton action="{path}/remove" label="Remove" removeLabel="Remove {file.name}" confirm="Remove {file.name}?" />{/if}
		</li>
	{/each}
</ul>
