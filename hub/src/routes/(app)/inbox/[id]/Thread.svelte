<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { mailFrame } from '$lib/actions.js';
	import { addDays, todayIn } from '$lib/dates';
	import { avatarHue, fullDate, listDate } from '$lib/inbox';
	import { initials } from '$lib/ui';
	import type { PageData } from './$types';

	// One conversation in the reading pane, shown like Outlook: older emails as one line until clicked,
	// the newest open, Reply / Reply all / Forward on each, and the reply written under them.
	let { data }: { data: PageData } = $props();
	const t = $derived(data.thread);
	const msgs = $derived(data.messages);
	type Msg = (typeof data.messages)[number];

	const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
	const line = (s: string) => s.replace(/\s+/g, ' ').trim();
	const nameOf = (m: Msg) => (m.direction === 'out' ? (m.sender ?? 'Someone') : m.from_name || m.from_email);

	let opened = $state<Record<number, boolean>>({});
	const isOpen = (m: Msg, i: number) => opened[m.id] ?? (i === msgs.length - 1 || !!m.error);

	// The arrows step through the list beside it: left is newer, right is older.
	const at = $derived(data.threads.findIndex((x) => x.id === t.id));
	const newer = $derived(at > 0 ? data.threads[at - 1] : null);
	const older = $derived(at >= 0 && at < data.threads.length - 1 ? data.threads[at + 1] : null);

	type Mode = 'reply' | 'all' | 'forward';
	let compose = $state<{ mode: Mode; of: number } | null>(null);
	let to = $state('');
	let cc = $state('');
	let bcc = $state('');
	let showCc = $state(false);
	let showBcc = $state(false);
	let later = $state(false);
	let sending = $state(false);
	let formEl = $state<HTMLFormElement>();
	let toEl = $state<HTMLInputElement>();
	let textEl = $state<HTMLTextAreaElement>();
	const of = $derived(compose ? msgs.find((m) => m.id === compose!.of) : undefined);
	// Outlook's first Schedule send choice: tomorrow, 8 AM.
	const tomorrow = $derived(`${addDays(todayIn(data.zone), 1)}T08:00`);

	async function start(mode: Mode, m: Msg) {
		compose = { mode, of: m.id };
		to = mode === 'forward' ? '' : m.reply.to;
		cc = mode === 'all' ? m.reply.cc : '';
		bcc = '';
		showCc = !!cc;
		showBcc = false;
		later = false;
		await tick();
		formEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		(mode === 'forward' ? toEl : textEl)?.focus({ preventScroll: true });
	}

	// The page stays put while it sends, so a reply that didn't go keeps its words.
	const submit: SubmitFunction = () => {
		sending = true;
		return async ({ result, update }) => {
			sending = false;
			if (result.type === 'redirect' && /[?&]ok=/.test(result.location)) compose = null;
			await update();
		};
	};

	const icons = {
		reply: ['M9 17 4 12 9 7', 'M20 18v-2a4 4 0 0 0-4-4H4'],
		all: ['M7 17 2 12 7 7', 'M12 17 7 12 12 7', 'M22 18v-2a4 4 0 0 0-4-4H7'],
		forward: ['M15 17 20 12 15 7', 'M4 18v-2a4 4 0 0 1 4-4h12'],
		left: ['m15 18-6-6 6-6'],
		right: ['m9 18 6-6-6-6'],
		down: ['m6 9 6 6 6-6'],
		file: ['M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z', 'M14 2v6h6']
	};
</script>

{#snippet icon(paths: string[], px = 18)}
	<svg viewBox="0 0 24 24" width={px} height={px} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#each paths as d}<path {d} />{/each}
	</svg>
{/snippet}

{#snippet pic(name: string)}
	<span class="pic" style="--hue: {avatarHue(name)}" aria-hidden="true">{initials(name)}</span>
{/snippet}

<div class="read card">
	<header class="read-head">
		<div class="tools">
			<a class="btn ghost back" href={t.status === 'done' ? '/inbox?show=done' : '/inbox'}>Back</a>
			{#if t.status === 'open'}
				<form method="post" action="?/done"><button class="btn">Done</button></form>
			{:else}
				<form method="post" action="?/reopen"><button class="btn">Reopen</button></form>
			{/if}
			<form method="post" action="?/unread"><button class="btn ghost">Mark unread</button></form>
			<span class="steps">
				{#if newer}
					<a class="icon-btn" href="/inbox/{newer.id}" title="Newer" aria-label="Newer">{@render icon(icons.left)}</a>
				{:else}
					<span class="icon-btn off" aria-hidden="true">{@render icon(icons.left)}</span>
				{/if}
				{#if older}
					<a class="icon-btn" href="/inbox/{older.id}" title="Older" aria-label="Older">{@render icon(icons.right)}</a>
				{:else}
					<span class="icon-btn off" aria-hidden="true">{@render icon(icons.right)}</span>
				{/if}
			</span>
		</div>
		<h2 class="subject">{t.subject}</h2>
	</header>

	<ol class="messages">
		{#each msgs as m, i (m.id)}
			<li class="msg" class:out={m.direction === 'out'} id={i === msgs.length - 1 ? 'end' : undefined}>
				{#if !isOpen(m, i)}
					<button type="button" class="folded" onclick={() => (opened[m.id] = true)}>
						{@render pic(nameOf(m))}
						<strong class="name">{nameOf(m)}</strong>
						<time class="when">{listDate(m.created_at, data.zone)}</time>
						<span class="snip">{line(m.text) || '(no text)'}</span>
					</button>
				{:else}
					<header class="msg-head">
						{@render pic(nameOf(m))}
						<div class="msg-who">
							{#if m.direction === 'out'}
								<strong>{nameOf(m)}</strong> <span class="muted small">{m.forward ? 'forwarded' : 'replied'} from {m.from_email}</span>
							{:else}
								<strong>{nameOf(m)}</strong>
								{#if m.from_name}<span class="muted small">&lt;{m.from_email}&gt;</span>{/if}
							{/if}
							<div class="muted small">To: {m.to_emails || '—'}</div>
							{#if m.cc_emails}<div class="muted small">Cc: {m.cc_emails}</div>{/if}
							{#if m.bcc_emails}<div class="muted small">Bcc: {m.bcc_emails}</div>{/if}
						</div>
						<div class="msg-side">
							<div class="acts">
								<button type="button" class="icon-btn" title="Reply" aria-label="Reply" onclick={() => start('reply', m)}>{@render icon(icons.reply)}</button>
								<button type="button" class="icon-btn" title="Reply all" aria-label="Reply all" onclick={() => start('all', m)}>{@render icon(icons.all)}</button>
								<button type="button" class="icon-btn" title="Forward" aria-label="Forward" onclick={() => start('forward', m)}>{@render icon(icons.forward)}</button>
							</div>
							<time class="muted small">{fullDate(m.created_at, data.zone)}</time>
						</div>
					</header>
					{#if m.error}<p class="flash err small">Not sent: {m.error}</p>{/if}
					{#if m.files.length}
						<ul class="files">
							{#each m.files as f (f.id)}
								<li>
									<a href="/inbox/file/{f.id}" download={f.name}>
										{@render icon(icons.file, 20)}
										<span class="file-name">{f.name}</span>
										<span class="muted small">{size(f.size)}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
					{#if m.frame}
						<!-- No scripts run inside; links open in a new tab. -->
						<iframe
							class="body-frame"
							title="Email from {m.from_email}"
							sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
							srcdoc={m.frame}
							use:mailFrame={{ fold: !m.forward }}
						></iframe>
					{:else}
						<div class="body-text">{m.text || '(no text)'}</div>
						{#if m.quote}
							<details class="quote">
								<summary title="Show quoted text">•••</summary>
								<div class="body-text muted">{m.quote}</div>
							</details>
						{/if}
					{/if}
				{/if}
			</li>
		{/each}
		{#each data.scheduled as s (s.id)}
			<li class="msg out waiting">
				<header class="msg-head">
					{@render pic(s.sender ?? 'Someone')}
					<div class="msg-who">
						<strong>{s.sender ?? 'Someone'}</strong> <span class="muted small">Scheduled for {fullDate(s.send_at, data.zone)}</span>
						<div class="muted small">To: {s.to_emails}</div>
						{#if s.cc_emails}<div class="muted small">Cc: {s.cc_emails}</div>{/if}
						{#if s.bcc_emails}<div class="muted small">Bcc: {s.bcc_emails}</div>{/if}
					</div>
					<form method="post" action="?/cancel" class="msg-side">
						<input type="hidden" name="scheduled" value={s.id} />
						<button class="btn ghost">Cancel</button>
					</form>
				</header>
				<div class="body-text">{s.text || '(no text)'}</div>
				{#if s.files.length}
					<ul class="files">
						{#each s.files as f, j (j)}
							<li><span class="file">{@render icon(icons.file, 20)}<span class="file-name">{f.name}</span><span class="muted small">{size(f.size)}</span></span></li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ol>

	{#if compose}
		<form class="compose" id="reply" bind:this={formEl} method="post" action="?/send" enctype="multipart/form-data" use:enhance={submit}>
			<input type="hidden" name="mode" value={compose.mode === 'forward' ? 'forward' : 'reply'} />
			<input type="hidden" name="of" value={compose.of} />
			<p class="muted small compose-from">{compose.mode === 'forward' ? 'Forward' : 'Reply'} from {data.from}</p>
			<div class="addr">
				<label for="compose-to">To</label>
				<input id="compose-to" name="to" bind:this={toEl} bind:value={to} required autocomplete="off" />
				<span class="toggles">
					{#if !showCc}<button type="button" class="link-btn" onclick={() => (showCc = true)}>Cc</button>{/if}
					{#if !showBcc}<button type="button" class="link-btn" onclick={() => (showBcc = true)}>Bcc</button>{/if}
				</span>
			</div>
			{#if showCc}
				<div class="addr">
					<label for="compose-cc">Cc</label>
					<input id="compose-cc" name="cc" bind:value={cc} autocomplete="off" />
				</div>
			{/if}
			{#if showBcc}
				<div class="addr">
					<label for="compose-bcc">Bcc</label>
					<input id="compose-bcc" name="bcc" bind:value={bcc} autocomplete="off" />
				</div>
			{/if}
			<textarea name="text" rows="8" aria-label="Message" bind:this={textEl} required={compose.mode !== 'forward'}></textarea>
			{#if compose.mode === 'forward' && of?.files.length}
				<ul class="files">
					{#each of.files as f (f.id)}
						<li><span class="file">{@render icon(icons.file, 20)}<span class="file-name">{f.name}</span><span class="muted small">{size(f.size)}</span></span></li>
					{/each}
				</ul>
			{/if}
			<label class="field">
				<span>Files <span class="muted small">(optional, under 18 MB together)</span></span>
				<input type="file" name="file" multiple />
			</label>
			<label class="check">
				<input type="checkbox" name="done" checked />
				<span>Mark done after sending</span>
			</label>
			<div class="send-row">
				<span class="split">
					<button class="btn primary" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
					<button type="button" class="btn primary caret" title="Schedule send" aria-label="Schedule send" aria-expanded={later} onclick={() => (later = !later)}>{@render icon(icons.down, 16)}</button>
				</span>
				<button type="button" class="btn ghost" onclick={() => (compose = null)}>Discard</button>
			</div>
			{#if later}
				<div class="later">
					<label class="field">
						<span>Schedule send</span>
						<input type="datetime-local" name="send_at" value={tomorrow} />
					</label>
					<button class="btn" formaction="?/schedule" disabled={sending}>Schedule send</button>
				</div>
			{/if}
		</form>
	{/if}
</div>

<style>
	.read {
		padding: 0;
		min-width: 0;
	}
	.read-head {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 10px 16px 12px;
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		border-radius: var(--radius) var(--radius) 0 0;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.tools form {
		display: contents;
	}
	.tools .btn {
		min-height: 32px;
		padding: 0 11px;
	}
	.steps {
		display: inline-flex;
		gap: 2px;
		margin-left: auto;
	}
	.icon-btn.off {
		opacity: 0.35;
		cursor: default;
	}
	.icon-btn.off:hover {
		background: transparent;
		color: var(--muted);
	}
	@container (min-width: 760px) {
		.back {
			display: none;
		}
	}
	.subject {
		margin: 10px 0 0;
		font: 600 19px/1.36 var(--display);
		overflow-wrap: anywhere;
	}
	.messages {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.msg {
		display: grid;
		gap: 12px;
		min-width: 0;
		padding: 14px 16px;
		border-bottom: 1px solid var(--line);
		scroll-margin-top: 90px;
	}
	.msg.out {
		background: var(--surface-2);
	}
	.msg.waiting {
		border-left: 3px solid var(--warn);
	}
	.pic {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: oklch(0.46 0.09 var(--hue));
		color: #fff;
		font: 600 13px/1 var(--sans);
	}
	.folded {
		display: grid;
		grid-template-columns: 36px minmax(0, 1fr) auto;
		column-gap: 12px;
		align-items: center;
		width: 100%;
		margin: -4px 0;
		padding: 4px 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.folded .pic {
		grid-row: 1 / span 2;
	}
	.folded .name,
	.folded .snip {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.folded .when {
		font-size: 12.5px;
		color: var(--muted);
		white-space: nowrap;
	}
	.folded .snip {
		grid-column: 2 / -1;
		font-size: 13.5px;
		color: var(--muted);
	}
	.msg-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 12px;
	}
	.msg-who {
		flex: 1 1 220px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.msg-who .small {
		margin-left: 2px;
	}
	.msg-side {
		display: grid;
		justify-items: end;
		gap: 2px;
		margin-left: auto;
	}
	.acts {
		display: flex;
		gap: 2px;
	}
	.files {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0;
		padding: 0;
	}
	.files a,
	.files .file {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		column-gap: 8px;
		align-items: center;
		max-width: 260px;
		padding: 7px 12px 7px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		color: inherit;
		text-decoration: none;
	}
	.files a:hover {
		background: var(--surface-3);
	}
	.files :global(svg) {
		grid-row: 1 / span 2;
		color: var(--muted);
	}
	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13.5px;
	}
	.body-frame {
		display: block;
		width: 100%;
		min-height: 60px;
		border: 0;
		background: transparent;
		/* Shown once its colors are dark; the animation shows it anyway if that never happens. */
		visibility: hidden;
		animation: frame-show 0s 2s forwards;
	}
	@keyframes frame-show {
		to {
			visibility: visible;
		}
	}
	.body-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.quote > summary {
		display: inline-block;
		list-style: none;
		margin: 2px 0 8px;
		padding: 0 10px;
		border-radius: 6px;
		background: var(--surface-3);
		font: 700 12px/20px var(--sans);
		letter-spacing: 2px;
		cursor: pointer;
	}
	.quote > summary::-webkit-details-marker {
		display: none;
	}
	.quote > summary:hover {
		background: var(--line-strong);
	}
	.compose {
		display: grid;
		gap: 10px;
		padding: 14px 16px 16px;
	}
	.compose-from {
		margin: 0;
	}
	.addr {
		display: flex;
		align-items: center;
		gap: 10px;
		border-bottom: 1px solid var(--line-strong);
	}
	.addr label {
		flex: none;
		width: 32px;
		color: var(--muted);
		font-size: 14px;
	}
	.addr input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		box-shadow: none;
		padding-inline: 0;
	}
	.addr input:focus {
		outline: none;
	}
	.addr:focus-within {
		border-bottom-color: var(--accent);
	}
	.toggles {
		display: flex;
		gap: 10px;
		font-size: 14px;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.check input {
		width: auto;
		min-height: 0;
	}
	.send-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.split {
		display: inline-flex;
	}
	.split .btn:first-child {
		border-radius: 999px 0 0 999px;
	}
	.split .caret {
		padding: 0 10px;
		border-radius: 0 999px 999px 0;
		border-left: 1px solid rgb(0 0 0 / 0.25);
	}
	.later {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
	.later .field {
		flex: 1 1 220px;
	}
</style>
