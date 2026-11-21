<script lang="ts">
	import { personSelect } from '$lib/actions.js';
	import { fileKind } from '$lib/files';
	import type { LibraryItem } from '$lib/types';

	let { items, root, subteams, filters }: { items: LibraryItem[]; root: string; subteams: number[]; filters: { type: string; person: string; creator: string; meeting: string; group: string } } = $props();

	const key = (id: number | null) => (id === null ? 'unknown' : String(id));
	const kind = (item: LibraryItem) => (item.url ? 'Link' : fileKind(item.original_name));
	const options = (pairs: [string, string][]) => [...new Map(pairs).entries()].sort((a, b) => a[1].localeCompare(b[1]));
	const people = $derived(options(items.map((i) => [key(i.author_id), i.author_name ?? 'Unknown'])));
	const creators = $derived(options(items.map((i) => [key(i.creator_id), i.creator_name ?? 'Unknown'])));
	const meetings = $derived(options(items.map((i) => [String(i.meeting_id), i.meeting_title])));
	const types = $derived([...new Set(items.map(kind))].sort());
	const filtered = $derived(
		items.filter(
			(i) =>
				(!filters.type || filters.type === kind(i)) &&
				(!filters.person || filters.person === key(i.author_id)) &&
				(!filters.creator || filters.creator === key(i.creator_id)) &&
				(!filters.meeting || filters.meeting === String(i.meeting_id))
		)
	);
	const groups = $derived.by(() => {
		const map = new Map<string, LibraryItem[]>();
		for (const item of filtered) {
			const group = filters.group === 'creator' ? (item.creator_name ?? 'Unknown') : filters.group === 'type' ? kind(item) : '';
			map.set(group, [...(map.get(group) ?? []), item]);
		}
		return [...map.entries()];
	});
	const icon = (item: LibraryItem) => {
		const k = kind(item);
		return item.url ? '↗' : k === 'PDF' ? 'PDF' : k === 'PowerPoint' ? 'P' : k === 'Word document' ? 'W' : k === 'Excel spreadsheet' ? 'X' : k === 'Audio' ? '♫' : '≡';
	};
</script>

<section class="card team-library" id="team-library" aria-labelledby="team-library-title">
	<h2 id="team-library-title" class="section-title">Library</h2>
	{#if items.length}
		<form method="get" action="{root}#team-library" class="team-library-filters">
			{#each subteams as id}<input type="hidden" name="subteam" value={id} />{/each}
			<label
				>File type<select name="library_type"
					><option value="">All types</option>{#each types as v}<option value={v} selected={filters.type === v}>{v}</option>{/each}</select
				></label
			>
			<label
				>Added by<select name="library_person" data-person use:personSelect
					><option value="">Everyone</option>{#each people as [value, name]}<option {value} selected={filters.person === value}>{name}</option>{/each}</select
				></label
			>
			<label
				>Meeting creator<select name="library_creator" data-person use:personSelect
					><option value="">Everyone</option>{#each creators as [value, name]}<option {value} selected={filters.creator === value}>{name}</option>{/each}</select
				></label
			>
			<label
				>Meeting<select name="library_meeting"
					><option value="">All meetings</option>{#each meetings as [value, name]}<option {value} selected={filters.meeting === value}>{name}</option>{/each}</select
				></label
			>
			<label
				>Group by<select name="library_group"
					><option value="">None</option><option value="creator" selected={filters.group === 'creator'}>Meeting creator</option><option
						value="type"
						selected={filters.group === 'type'}>File type</option
					></select
				></label
			>
			<button class="btn small">Apply</button>
		</form>
		{#if filtered.length}
			{#each groups as [label, group]}
				<div class="team-library-group">
					{#if label}<h3>{label}</h3>{/if}
					<ul class="att-list library-list">
						{#each group as item}
							<li class="library-file">
								<span class="library-icon" aria-hidden="true">{icon(item)}</span>
								<div class="library-file-info">
									<a href={item.url ?? `/meetings/${item.meeting_id}/files/${item.id}`} target={item.url ? '_blank' : undefined} rel={item.url ? 'noopener noreferrer' : undefined}
										>{item.name}</a
									>
									<span class="hint"
										>{kind(item)} · Added by {item.author_name ?? 'Unknown'} · <a href="/meetings/{item.meeting_id}?view=library">{item.meeting_title}</a> · Meeting created by {item.creator_name ??
											'Unknown'}</span
									>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		{:else}
			<p class="hint">No items match these filters.</p>
		{/if}
	{:else}
		<p class="hint">No meeting library items yet.</p>
	{/if}
</section>
