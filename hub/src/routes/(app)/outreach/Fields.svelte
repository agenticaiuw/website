<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import type { Outreach, OutreachOptions } from '$lib/server/outreach';

	/** The outreach form's fields, empty for a new contact. */
	let { options, row = undefined }: { options: OutreachOptions; row?: Partial<Outreach> } = $props();
	const v = (k: keyof Outreach) => String(row?.[k] ?? '');
	const lists: [string, string[]][] = $derived([
		['outreach-kinds', options.kinds],
		['outreach-regions', options.regions],
		['outreach-statuses', options.statuses],
		['outreach-priorities', options.priorities],
		['outreach-owners', options.owners]
	]);
</script>

<div class="field-pair">
	<Field label="Organization"><input name="organization" maxlength={200} value={v('organization')} /></Field>
	<Field label="Name"><input name="name" maxlength={200} value={v('name')} /></Field>
</div>
<div class="field-pair">
	<Field label="Kind"><input name="kind" list="outreach-kinds" maxlength={80} value={v('kind')} /></Field>
	<Field label="Region"><input name="region" list="outreach-regions" maxlength={80} value={v('region')} /></Field>
</div>
<div class="field-pair">
	<Field label="Email"><input type="email" name="email" maxlength={200} value={v('email')} /></Field>
	<Field label="Phone"><input type="tel" name="phone" maxlength={60} value={v('phone')} /></Field>
</div>
<Field label="Link"><input name="link" maxlength={500} value={v('link')} /></Field>
<Field label="Why we're reaching out"><input name="purpose" maxlength={500} value={v('purpose')} /></Field>
<div class="field-pair">
	<Field label="Status"><input name="status" list="outreach-statuses" maxlength={80} value={v('status')} /></Field>
	<Field label="Priority"><input name="priority" list="outreach-priorities" maxlength={40} value={v('priority')} /></Field>
</div>
<Field label="Handled by"><input name="owner" list="outreach-owners" maxlength={100} value={v('owner')} /></Field>
<Field label="Notes"><textarea name="notes" rows={4} maxlength={5000}>{v('notes')}</textarea></Field>
<Field label="Source"><input name="source" maxlength={500} value={v('source')} /></Field>
{#each lists as [id, values] (id)}
	<datalist {id}>{#each values as x (x)}<option value={x}></option>{/each}</datalist>
{/each}
