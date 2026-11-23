<script lang="ts">
	import { fileLimit } from '$lib/actions.js';
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import { fileKind } from '$lib/files';
	import { FILE_TYPES } from '$lib/meetings';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
	const icon = (name: string) => {
		const k = fileKind(name);
		return k === 'PDF' ? 'PDF' : k === 'PowerPoint' ? 'P' : k === 'Word document' ? 'W' : k === 'Excel spreadsheet' ? 'X' : k === 'Audio' ? '♫' : '≡';
	};
	// The constitution is also linked from the Handbook, under its own address.
	const href = (key: string) => (key === 'constitution' ? '/handbook/constitution' : `/files/${key}`);
</script>

<PageHead title="Files" sub="Files for the whole club and for each team. A team's files are seen by its members and execs." />

{#if data.places.length}
	<form method="post" action="?/upload" enctype="multipart/form-data" class="card stack files-upload">
		<h2 class="section-title">Upload</h2>
		<div class="files-upload-fields">
			<Field label="Files" hint="PDF, Word, PowerPoint, Excel, text, images or audio. Up to 32 MiB at a time.">
				<input type="file" name="file" multiple required accept={FILE_TYPES} use:fileLimit={32 * 1024 * 1024} />
			</Field>
			<Field label="For">
				<select name="place" required>
					{#each data.places as p}<option value={p.id === null ? 'club' : String(p.id)}>{p.name}</option>{/each}
				</select>
			</Field>
		</div>
		<div><button class="btn primary">Upload</button></div>
	</form>
{/if}

{#each data.groups as g (g.place.id)}
	<section class="card files-place" id={g.place.id === null ? 'club' : `team-${g.place.id}`} aria-labelledby="place-{g.place.id ?? 'club'}">
		<h2 class="section-title" id="place-{g.place.id ?? 'club'}">{g.place.name}</h2>
		<ul class="att-list library-list">
			{#each g.files as f (f.key)}
				<li class="library-file">
					<span class="library-icon" aria-hidden="true">{icon(f.name)}</span>
					<div class="library-file-info">
						<a href={href(f.key)}>{f.name}</a>
						<span class="hint">{fileKind(f.name)} · {size(f.size)} · Added {f.uploader ? `by ${f.uploader}, ` : ''}{formatTimestamp(f.updated_at, data.zone)}</span>
					</div>
					{#if f.removable}
						<form method="post" action="?/remove">
							<input type="hidden" name="key" value={f.key} />
							<button class="btn small ghost" aria-label="Remove {f.name}">Remove</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<Empty>No files yet.</Empty>
{/each}

{#if data.removed.length}
	<details class="card disclose">
		<summary>Removed files ({data.removed.length})</summary>
		<ul class="att-list library-list files-removed">
			{#each data.removed as f (f.key)}
				<li class="library-file">
					<div class="library-file-info">
						<a href="/files/{f.key}">{f.name}</a>
						<span class="hint">{f.team_name ?? 'Whole club'} · Removed {f.remover ? `by ${f.remover}, ` : ''}{formatTimestamp(f.removed_at, data.zone)}</span>
					</div>
					<form method="post" action="?/restore">
						<input type="hidden" name="key" value={f.key} />
						<button class="btn small" aria-label="Put back {f.name}">Put back</button>
					</form>
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style>
	.files-upload-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; }
	.files-upload-fields input[type='file'] { max-width: 100%; }
	.files-place, .files-upload, details { margin-bottom: 20px; }
	.files-place .section-title { margin-bottom: 12px; }
	.files-removed { margin-top: 12px; }
	@media (max-width: 640px) {
		.files-upload-fields { grid-template-columns: minmax(0, 1fr); }
	}
</style>
