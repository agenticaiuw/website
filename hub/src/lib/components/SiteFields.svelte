<script lang="ts">
	import type { Field, HubTeam } from '$lib/site';
	import SiteFields from './SiteFields.svelte';

	type Data = Record<string, unknown>;
	type ListField = Extract<Field, { t: 'list' }>;
	type StringsField = Extract<Field, { t: 'strings' }>;

	/** The website editor's inputs for one set of fields. The siteForm action reads them back by `data-k`. */
	let { fields, data, teams }: { fields: Field[]; data: Data; teams: HubTeam[] } = $props();

	const rowsFor = (s: string, min = 2) => Math.min(14, Math.max(min, Math.ceil(s.length / 70) + s.split('\n').length - 1));
	/** "Head: …" and "Leads: …" for a hub team, as the site will show them. */
	const peopleLine = (t?: HubTeam) =>
		t
			? [`Head: ${t.heads.join(', ') || 'none yet'}`, `Leads: ${t.leads.map((l) => (l.title ? `${l.name} (${l.title})` : l.name)).join(', ') || 'none yet'}`].join(' · ')
			: '';
	const itemTitle = (f: ListField, item: Data, i: number) =>
		(f.title && String(item?.[f.title] ?? '').trim()) || (i >= 0 ? `${f.item.charAt(0).toUpperCase() + f.item.slice(1)} ${i + 1}` : `New ${f.item}`);
</script>

{#snippet hint(text?: string)}{#if text}<span class="hint">{text}</span>{/if}{/snippet}

{#snippet tools(item: string)}
	<span class="site-item-tools">
		<button type="button" class="icon-btn" data-move="-1" aria-label="Move {item} up" title="Move up">↑</button>
		<button type="button" class="icon-btn" data-move="1" aria-label="Move {item} down" title="Move down">↓</button>
		<button type="button" class="icon-btn site-remove" data-remove aria-label="Remove {item}" title="Remove">×</button>
	</span>
{/snippet}

{#snippet listItem(f: ListField, item: Data, i: number, open: boolean)}
	<li class="site-item" data-item>
		<details {open}>
			<summary><span class="site-item-title" data-item-title data-title-key={f.title ?? ''} data-fallback="New {f.item}">{itemTitle(f, item, i)}</span></summary>
			<div class="site-item-body"><SiteFields fields={f.fields} data={item} {teams} /></div>
		</details>
		{@render tools(f.item)}
	</li>
{/snippet}

{#snippet stringItem(f: StringsField, s: string)}
	<li class="site-string" data-item>
		<input data-k="" value={s} aria-label={f.item} maxlength={400} />
		{@render tools(f.item)}
	</li>
{/snippet}

{#each fields as f}
	{@const value = data?.[f.k]}
	{#if f.t === 'group'}
		<fieldset class="site-group" data-obj data-k={f.k}>
			<legend>{f.label}</legend>
			<SiteFields fields={f.fields} data={(value as Data) ?? {}} {teams} />
		</fieldset>
	{:else if f.t === 'list'}
		{@const items = (value as Data[]) ?? []}
		<div class="site-list" data-list data-k={f.k}>
			<div class="site-list-head">
				<span class="label">{f.label}</span>
				<span class="muted site-count" data-count>{items.length}</span>
			</div>
			{@render hint(f.hint)}
			<ol class="site-items" data-items>
				{#each items as item, i}{@render listItem(f, item, i, false)}{/each}
			</ol>
			<template data-tpl>{@render listItem(f, {}, -1, true)}</template>
			<button type="button" class="btn small site-add" data-add>+ Add {f.item}</button>
		</div>
	{:else if f.t === 'strings'}
		{@const items = (value as string[]) ?? []}
		<div class="site-list" data-list data-strings data-k={f.k}>
			<div class="site-list-head"><span class="label">{f.label}</span></div>
			{@render hint(f.hint)}
			<ol class="site-items" data-items>
				{#each items as s}{@render stringItem(f, s)}{/each}
			</ol>
			<template data-tpl>{@render stringItem(f, '')}</template>
			<button type="button" class="btn small site-add" data-add>+ Add {f.item}</button>
		</div>
	{:else if f.t === 'bool'}
		<label class="check site-check">
			<input type="checkbox" data-k={f.k} checked={!!value} />
			{f.label}
			{#if f.hint}<span class="hint">{' '}{f.hint}</span>{/if}
		</label>
	{:else if f.t === 'team'}
		{@const chosen = teams.find((t) => t.id === Number(value))}
		<label class="field">
			<span class="label">{f.label}</span>
			<select data-k={f.k} data-team-select>
				<option value="" selected={!chosen}>Choose a team</option>
				{#each teams as t}<option value={String(t.id)} selected={t === chosen} data-people={peopleLine(t)}>{t.name}</option>{/each}
			</select>
			<span class="hint site-team-people" data-team-people>{peopleLine(chosen)}</span>
			{@render hint(f.hint)}
		</label>
	{:else if f.t === 'number'}
		<label class="field">
			<span class="label">{f.label}</span>
			<input type="number" step="any" data-k={f.k} value={String(value ?? '')} />
			{@render hint(f.hint)}
		</label>
	{:else if f.t === 'long' || f.t === 'rich'}
		{@const s = String(value ?? '')}
		<label class="field">
			<span class="label">{f.label}{#if f.optional}<span class="muted">{' (optional)'}</span>{/if}</span>
			<textarea data-k={f.k} rows={rowsFor(s)} value={s}></textarea>
			{@render hint(f.hint)}
		</label>
	{:else}
		<label class="field">
			<span class="label">{f.label}{#if f.optional}<span class="muted">{' (optional)'}</span>{/if}</span>
			<input type={f.t === 'date' ? 'date' : 'text'} data-k={f.k} value={String(value ?? '')} inputmode={f.t === 'url' ? 'url' : undefined} />
			{@render hint(f.hint)}
		</label>
	{/if}
{/each}
