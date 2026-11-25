<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Empty from '$lib/components/Empty.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { avatarHue, dayGroup, listDate } from '$lib/inbox';
	import { initials } from '$lib/ui';
	import type { LayoutData } from './$types';

	// Laid out like Outlook: the message list on the left, the picked conversation in a reading pane on
	// the right. On a narrow screen one shows at a time.
	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const current = $derived(page.params.id ? Number(page.params.id) : null);
	const groups = $derived.by(() => {
		const out: { label: string; threads: typeof data.threads }[] = [];
		for (const t of data.threads) {
			const label = dayGroup(t.last_at, data.zone);
			if (out.at(-1)?.label !== label) out.push({ label, threads: [] });
			out.at(-1)!.threads.push(t);
		}
		return out;
	});
	const clip = 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48';
</script>

<div class="mail-wrap">
	<div class="mail" class:reading={current !== null}>
		<div class="head">
			<PageHead title="Inbox" sub="Email sent to {data.address} and the club's other addresses. Execs share it." />
		</div>
		<section class="list-pane card" aria-label="Inbox">
			<div class="list-tabs">
				<Tabs label="Open or done" options={[['open', 'Open'], ['done', 'Done']]} current={data.show} href={(v) => (v === 'done' ? '/inbox?show=done' : '/inbox')} />
			</div>
			{#if data.threads.length}
				{#each groups as g (g.label)}
					<h2 class="group">{g.label}</h2>
					<ul class="rows">
						{#each g.threads as t (t.id)}
							<li>
								<a
									href="/inbox/{t.id}"
									class="row"
									class:unread={t.unread && t.status === 'open' && t.id !== current}
									aria-current={t.id === current ? 'page' : undefined}
								>
									<span class="pic" style="--hue: {avatarHue(t.who)}" aria-hidden="true">{initials(t.who)}</span>
									<span class="sender">{t.who}{#if t.count > 1}<span class="sender-n"> {t.count}</span>{/if}</span>
									<time class="when" datetime={t.last_at}>{listDate(t.last_at, data.zone)}</time>
									<span class="subject">{t.subject}</span>
									{#if t.files}
										<svg class="clip" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Has files"><path d={clip} /></svg>
									{/if}
									<span class="preview">{t.preview}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/each}
			{:else}
				<div class="list-empty"><Empty>{data.show === 'done' ? 'Nothing marked done yet.' : 'No email waiting.'}</Empty></div>
			{/if}
		</section>
		<section class="read-pane">{@render children()}</section>
	</div>
</div>

<style>
	.mail-wrap {
		container-type: inline-size;
	}
	.mail {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0 16px;
		align-items: start;
	}
	/* One pane at a time on a narrow screen: the list, or the conversation. */
	.mail.reading .head,
	.mail.reading .list-pane,
	.mail:not(.reading) .read-pane {
		display: none;
	}
	@container (min-width: 760px) {
		.mail {
			grid-template-columns: minmax(270px, 340px) minmax(0, 1fr);
		}
		.head {
			grid-column: 1 / -1;
		}
		.mail.reading .head,
		.mail.reading .list-pane,
		.mail:not(.reading) .read-pane {
			display: block;
		}
		/* Each pane scrolls on its own, like Outlook's. */
		.list-pane,
		.read-pane {
			position: sticky;
			top: 16px;
			max-height: calc(100dvh - 32px);
			overflow-y: auto;
			overscroll-behavior: contain;
		}
	}
	.list-pane {
		padding: 0;
		overflow: hidden;
	}
	@container (min-width: 760px) {
		.list-pane {
			overflow-y: auto;
		}
	}
	.list-tabs {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 12px 12px 10px;
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}
	.group {
		margin: 0;
		padding: 12px 14px 4px;
		font: 600 12.5px/1.4 var(--sans);
		color: var(--muted);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr) auto;
		column-gap: 10px;
		row-gap: 1px;
		align-items: baseline;
		padding: 9px 12px 9px 9px;
		border-left: 3px solid transparent;
		border-bottom: 1px solid var(--line);
		color: inherit;
		text-decoration: none;
	}
	.row:hover {
		background: var(--surface-2);
	}
	.row[aria-current='page'] {
		background: var(--surface-3);
	}
	.pic {
		grid-row: 1 / span 3;
		align-self: start;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		margin-top: 2px;
		border-radius: 50%;
		background: oklch(0.46 0.09 var(--hue));
		color: #fff;
		font: 600 12.5px/1 var(--sans);
	}
	.sender,
	.subject,
	.preview {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sender {
		font-size: 14.5px;
	}
	.sender-n {
		margin-left: 4px;
		color: var(--muted);
		font-weight: 400;
	}
	.when {
		font-size: 12.5px;
		color: var(--muted);
		white-space: nowrap;
	}
	.subject {
		grid-column: 2;
		font-size: 13.5px;
	}
	.clip {
		grid-column: 3;
		justify-self: end;
		align-self: center;
		color: var(--muted);
	}
	.preview {
		grid-column: 2 / -1;
		font-size: 13px;
		color: var(--muted);
	}
	/* Unread, as in Outlook: a bar on the left, the sender bold, the subject bold in the accent color. */
	.row.unread {
		border-left-color: var(--accent);
	}
	.row.unread .sender {
		font-weight: 650;
	}
	.row.unread .subject {
		font-weight: 650;
		color: var(--accent);
	}
	.list-empty {
		padding: 16px;
	}
</style>
