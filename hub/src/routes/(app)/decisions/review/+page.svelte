<script lang="ts">
	import Empty from '$lib/components/Empty.svelte';
	import Field from '$lib/components/Field.svelte';
	import MemberSelect from '$lib/components/MemberSelect.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const item = $derived(data.item);
	const label = { open: 'Open', official: 'Official', dropped: 'Dropped' };
	// For a question, the text box holds an answer that isn't one of the choices.
	const other = $derived(item && item.options.length && item.body && !item.options.some((o) => o.body === item.body) ? item.body : '');
	const picked = (o: { body: string | null }) => (o.body === null ? item?.status === 'dropped' : item?.status === 'official' && item.body === o.body);
</script>

<PageHead title="Decide">
	{#snippet sub()}{data.openCount} left to decide. Nothing is official until it's confirmed here, and each answer is saved the moment you pick it.{/snippet}
	{#snippet actions()}<a class="btn" href="/decisions">See all decisions</a>{/snippet}
</PageHead>

<nav class="decide-strip" aria-label="Every decision">
	{#each data.strip as s}
		<a href="/decisions/review?id={s.id}" data-s={s.status} aria-current={s.id === item?.id ? 'true' : undefined} title={s.label} aria-label="{label[s.status]}: {s.label}"></a>
	{/each}
</nav>

{#if item}
	{#key item.id}
		<article class="card decide-card">
			<div class="decide-meta">
				<span class="eyebrow">{item.area}</span>
				<span class="decide-status" data-s={item.status}>{label[item.status]}</span>
				{#if item.exec_only}<span class="tag exec">Execs only</span>{/if}
				<span class="decide-pos">{data.position} of {data.total}</span>
			</div>
			{#if item.title}<h2 class="decide-title">{item.title}</h2>{/if}
			{#if item.body}<p class="decide-body">{item.body}</p>{/if}
			{#if item.context}<p class="decide-context">{item.context}</p>{/if}
			{#if item.decided_at}
				<p class="decide-context">{label[item.status]} since {formatTimestamp(item.decided_at, data.zone)}{item.decided_by_name ? `, by ${item.decided_by_name}` : ''}.</p>
			{/if}

			<form method="post" class="stack">
				<input type="hidden" name="id" value={String(item.id)} />
				<input type="hidden" name="base" value={item.updated_at} />
				<div class="field-pair">
					<Field label="Who's responsible"><MemberSelect name="owner" members={data.people} selected={item.owner_id} blank="Nobody yet" /></Field>
					<Field label="Starts"><input type="date" name="starts" value={item.starts_on} /></Field>
				</div>

				{#if item.options.length}
					<div class="decide-options">
						{#each item.options as o, i}
							<button class="btn decide-option" name="choice" value="o{i}" aria-pressed={picked(o)} data-drop={o.body === null ? '' : undefined}>
								<b>{o.label}</b>
								<span>{o.body ?? "It won't be a club rule."}</span>
							</button>
						{/each}
					</div>
					<details class="decide-more" open={!!other}>
						<summary>Something else</summary>
						<Field label="What's the decision?"><textarea name="body" rows={3} maxlength={2000} value={other}></textarea></Field>
						<div><button class="btn primary" name="choice" value="change">Save</button></div>
					</details>
					<div class="decide-actions">
						<button class="btn danger" name="choice" value="drop">Drop the question</button>
						{#if item.status !== 'open'}<button class="btn ghost" name="choice" value="reopen">Mark undecided</button>{/if}
					</div>
				{:else}
					<div class="decide-actions">
						<button class="btn primary" name="choice" value="confirm">Confirm</button>
						<button class="btn danger" name="choice" value="drop">Drop</button>
						{#if item.status !== 'open'}<button class="btn ghost" name="choice" value="reopen">Mark undecided</button>{/if}
					</div>
					<details class="decide-more">
						<summary>Change it</summary>
						<Field label="What should it say?"><textarea name="body" rows={4} maxlength={2000} value={item.body}></textarea></Field>
						<div><button class="btn primary" name="choice" value="change">Save the change</button></div>
					</details>
				{/if}
			</form>
		</article>
	{/key}
	<nav class="decide-nav" aria-label="Open decisions">
		{#if data.prevId}<a class="btn" href="/decisions/review?id={data.prevId}">Previous open</a>{:else}<span></span>{/if}
		{#if data.nextId}<a class="btn" href="/decisions/review?id={data.nextId}">Skip</a>{/if}
	</nav>
{:else}
	<Empty>Everything is decided. <a href="/decisions">See all decisions</a>.</Empty>
{/if}
