<script lang="ts">
	import { fitFrame } from '$lib/actions.js';
	import PageHead from '$lib/components/PageHead.svelte';
	import { formatTimestamp } from '$lib/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const t = $derived(data.thread);
	const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
	let sending = $state(false);
</script>

<PageHead eyebrow="Inbox" title={t.subject}>
	{#snippet actions()}
		<a class="btn ghost" href={t.status === 'done' ? '/inbox?show=done' : '/inbox'}>Back</a>
		<form method="post" action="?/unread"><button class="btn ghost">Mark unread</button></form>
		{#if t.status === 'open'}
			<form method="post" action="?/done"><button class="btn">Done</button></form>
		{:else}
			<form method="post" action="?/reopen"><button class="btn">Reopen</button></form>
		{/if}
	{/snippet}
</PageHead>

<ol class="messages">
	{#each data.messages as m, i (m.id)}
		<li class="card message" class:out={m.direction === 'out'} id={i === data.messages.length - 1 ? 'end' : undefined}>
			<header>
				<div class="from">
					{#if m.direction === 'out'}
						<strong>{m.sender ?? 'Someone'}</strong> <span class="muted small">replied from {m.from_email}</span>
					{:else}
						<strong>{m.from_name || m.from_email}</strong>
						{#if m.from_name}<span class="muted small">{m.from_email}</span>{/if}
					{/if}
				</div>
				<time class="muted small">{formatTimestamp(m.created_at, data.zone)}</time>
				<div class="to muted small">
					To {m.to_emails || '—'}{#if m.cc_emails}, cc {m.cc_emails}{/if}
				</div>
			</header>
			{#if m.error}<p class="flash err small">Not sent: {m.error}</p>{/if}
			{#if m.frame}
				<!-- No scripts run inside; links open in a new tab. -->
				<iframe class="body-frame" title="Email from {m.from_email}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc={m.frame} use:fitFrame></iframe>
			{:else}
				<div class="body-text">{m.text || '(no text)'}</div>
			{/if}
			{#if m.files.length}
				<ul class="files">
					{#each m.files as f (f.id)}
						<li><a href="/inbox/file/{f.id}" download={f.name}>{f.name}</a> <span class="muted small">{size(f.size)}</span></li>
					{/each}
				</ul>
			{/if}
		</li>
	{/each}
</ol>

<form class="card stack reply" id="reply" method="post" action="?/reply" enctype="multipart/form-data" onsubmit={() => (sending = true)}>
	<h2 class="section-title">Reply from {data.from}</h2>
	<label class="field">
		<span>To</span>
		<input name="to" value={data.reply.to} required autocomplete="off" />
	</label>
	<label class="field">
		<span>Cc</span>
		<input name="cc" value={data.reply.cc} autocomplete="off" placeholder="Optional" />
	</label>
	<label class="field">
		<span>Message</span>
		<textarea name="text" rows="8" required></textarea>
	</label>
	<label class="field">
		<span>Files <span class="muted small">(optional, under 18 MB together)</span></span>
		<input type="file" name="file" multiple />
	</label>
	<label class="check">
		<input type="checkbox" name="done" checked />
		<span>Mark done after sending</span>
	</label>
	<div><button class="btn primary" disabled={sending}>{sending ? 'Sending…' : 'Send reply'}</button></div>
</form>

<style>
	.messages {
		list-style: none;
		margin: 0 0 20px;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.message {
		scroll-margin-top: 16px;
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.message.out {
		background: var(--surface-2);
	}
	header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 12px;
	}
	.from {
		overflow-wrap: anywhere;
	}
	.from .small {
		margin-left: 4px;
	}
	.to {
		grid-column: 1 / -1;
		overflow-wrap: anywhere;
	}
	.body-frame {
		width: 100%;
		min-height: 80px;
		border: 0;
		background: #fff;
		border-radius: 6px;
	}
	.body-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.files {
		margin: 0;
		padding-left: 1.1rem;
		overflow-wrap: anywhere;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	:global(.page-head .actions form) {
		display: contents;
	}
</style>
