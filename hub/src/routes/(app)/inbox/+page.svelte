<script lang="ts">
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { formatTimestamp } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const line = (s: string) => s.replace(/\s+/g, ' ').trim();
</script>

<PageHead title="Inbox" sub="Email sent to {data.address} and the club's other addresses. Execs share it." />
<Tabs label="Open or done" options={[['open', 'Open'], ['done', 'Done']]} current={data.show} href={(v) => (v === 'done' ? '/inbox?show=done' : '/inbox')} />

{#if data.threads.length}
	<ul class="threads card">
		{#each data.threads as t (t.id)}
			<li class:unread={t.unread && t.status === 'open'}>
				<a href="/inbox/{t.id}">
					<span class="sender">{t.who}{#if t.count > 1}<span class="muted count"> {t.count}</span>{/if}</span>
					<span class="when muted small">{formatTimestamp(t.last_at, data.zone)}</span>
					<span class="subject">{t.subject}</span>
					<span class="preview muted small">{line(t.preview)}</span>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<Empty>{data.show === 'done' ? 'Nothing marked done yet.' : 'No email waiting.'}</Empty>
{/if}

<style>
	.threads {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		overflow: hidden;
	}
	.threads li + li {
		border-top: 1px solid var(--line);
	}
	.threads a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 12px;
		padding: 12px 16px;
		color: inherit;
		text-decoration: none;
	}
	.threads a:hover {
		background: var(--surface-2);
	}
	.sender,
	.subject,
	.preview {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.subject,
	.preview {
		grid-column: 1 / -1;
	}
	.unread .sender,
	.unread .subject {
		font-weight: 650;
	}
	.unread .sender::before {
		content: '';
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 8px;
		border-radius: 50%;
		background: var(--primary);
		vertical-align: 1px;
	}
	.count {
		font-weight: 400;
	}
</style>
