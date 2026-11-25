// The club's shared inbox. Cloudflare Email Routing hands every email for the domain to the Worker's
// email handler (src/worker.ts), which calls receiveEmail. The raw message and its attachments go to
// R2 (MAIL); D1 keeps what the Inbox page shows. Execs reply from the hub, through the same Gmail
// address every other hub email comes from (Cloudflare Email Sending), with the headers that keep the conversation threaded.
import PostalMime, { type Address, type Attachment } from 'postal-mime';
import { all, first, run } from './db.ts';
import { sendMail } from './mail.ts';
import type { Env } from '../types.ts';

const MiB = 1024 * 1024;
/** Replies' files together. Cloudflare takes 25 MiB a message, and base64 makes them a third bigger. */
export const REPLY_FILES_LIMIT = 18 * MiB;
/** A body longer than this is cut short here; the raw message in R2 keeps all of it. */
const BODY_LIMIT = 800_000;

export type InboxThread = {
	id: number;
	subject: string;
	status: 'open' | 'done';
	unread: number;
	last_at: string;
	/** The newest message's sender, and a line of its text. */
	who: string;
	preview: string;
	count: number;
	/** Files across its emails, not counting pictures in their bodies. */
	files: number;
};

export type InboxAttachment = { id: number; message_id: number; name: string; media_type: string; size: number; content_id: string; inline: number };

export type InboxMessage = {
	id: number;
	thread_id: number;
	direction: 'in' | 'out';
	message_id: string;
	refs: string;
	from_name: string;
	from_email: string;
	reply_to: string;
	to_emails: string;
	cc_emails: string;
	bcc_emails: string;
	subject: string;
	text: string;
	html: string;
	sender: string | null;
	error: string;
	created_at: string;
};

// ---------- reading an email ----------

/** Every <message-id> in a header, without the brackets. A bare id with no brackets counts too. */
export function messageIds(header: string | undefined): string[] {
	if (!header) return [];
	const bracketed = [...header.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]);
	if (bracketed.length) return bracketed;
	const bare = header.trim();
	return bare && !/\s/.test(bare) ? [bare] : [];
}

/** The subject without its Re:/Fwd: prefixes, for matching a reply to its thread. */
export const baseSubject = (s: string) =>
	s
		.replace(/^\s*((re|fwd?|aw|sv|wg)(\[\d+\])?\s*:\s*)+/i, '')
		.trim()
		.toLowerCase();

const mailboxes = (list: Address[] | Address | undefined) =>
	(Array.isArray(list) ? list : list ? [list] : []).flatMap((a) => (a.group ? a.group : [a])).filter((m) => m.address);

const addresses = (list: Address[] | Address | undefined) => mailboxes(list).map((m) => m.address!.toLowerCase());

const clip = (s: string | undefined) => (s ?? '').slice(0, BODY_LIMIT);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Readable text from an email's HTML, for one with no text part: the preview line and the quote in a reply. */
export function htmlToText(html: string) {
	return html
		.replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|h[1-6]|blockquote)>/gi, '\n\n')
		.replace(/<\/(div|li|tr)>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, e: string) =>
			e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? whole)
		)
		.replace(/[ \t]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

const bytesOf = (content: Attachment['content']) =>
	typeof content === 'string' ? new TextEncoder().encode(content) : content instanceof ArrayBuffer ? new Uint8Array(content) : content;

/** Safe to show as a file name, and to put in a header. */
export const cleanName = (name: string) => name.replace(/[\r\n"\\/]/g, '_').trim().slice(0, 200) || 'file';

type Parsed = Awaited<ReturnType<typeof PostalMime.parse>>;

/** The thread this email belongs to: one of the messages it answers, or else an open-ish thread with the same subject and this sender in it. */
async function findThread(db: D1Database, email: Parsed, from: string): Promise<number | null> {
	const refs = [...messageIds(email.inReplyTo), ...messageIds(email.references)].slice(-20);
	if (refs.length) {
		const hit = await first<{ thread_id: number }>(
			db,
			`SELECT thread_id FROM inbox_messages WHERE message_id IN (${refs.map(() => '?').join(', ')}) ORDER BY id DESC LIMIT 1`,
			...refs
		);
		if (hit) return hit.thread_id;
	}
	// Some mail programs drop the headers. A "Re:" from someone already in a thread from the last 60 days still joins it.
	const subject = baseSubject(email.subject ?? '');
	if (!subject || subject === (email.subject ?? '').trim().toLowerCase()) return null;
	const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
	const rows = await all<{ thread_id: number; subject: string }>(
		db,
		`SELECT m.thread_id, t.subject FROM inbox_messages m JOIN inbox_threads t ON t.id = m.thread_id
		 WHERE t.last_at > ? AND (lower(m.from_email) = ? OR (',' || lower(m.to_emails) || ',' || lower(m.cc_emails) || ',') LIKE '%,' || ? || ',%')
		 ORDER BY m.id DESC LIMIT 50`,
		since,
		from,
		from
	);
	return rows.find((r) => baseSubject(r.subject) === subject)?.thread_id ?? null;
}

/**
 * Keeps one incoming email: the raw message in R2, its parts in D1, in the thread it answers or a new one.
 * The same Message-ID twice (a retry) is kept once. Returns the thread.
 */
export async function receiveEmail(env: Pick<Env, 'DB' | 'MAIL'>, raw: ArrayBuffer, envelopeFrom = ''): Promise<number> {
	const email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' });
	const messageId = messageIds(email.messageId)[0] ?? '';
	if (messageId) {
		const seen = await first<{ thread_id: number }>(env.DB, "SELECT thread_id FROM inbox_messages WHERE message_id = ? AND direction = 'in'", messageId);
		if (seen) return seen.thread_id;
	}
	const sender = mailboxes(email.from)[0];
	const fromEmail = (sender?.address ?? envelopeFrom).toLowerCase();
	const subject = (email.subject ?? '').trim().slice(0, 500) || '(no subject)';

	const rawKey = `raw/${crypto.randomUUID()}.eml`;
	await env.MAIL.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } });

	let threadId = await findThread(env.DB, email, fromEmail);
	if (threadId === null) {
		const row = await first<{ id: number }>(env.DB, 'INSERT INTO inbox_threads (subject) VALUES (?) RETURNING id', subject);
		threadId = row!.id;
	}
	const msg = await first<{ id: number }>(
		env.DB,
		`INSERT INTO inbox_messages (thread_id, direction, message_id, in_reply_to, refs, from_name, from_email, reply_to, to_emails, cc_emails, subject, text, html, raw_key)
		 VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		threadId,
		messageId,
		messageIds(email.inReplyTo)[0] ?? '',
		messageIds(email.references).slice(-20).join(' '),
		(sender?.name ?? '').slice(0, 200),
		fromEmail,
		addresses(email.replyTo).join(', '),
		addresses(email.to).join(', '),
		addresses(email.cc).join(', '),
		subject,
		clip(email.text?.trim() ? email.text : htmlToText(email.html ?? '')),
		clip(email.html),
		rawKey
	);

	const files = email.attachments.filter((a) => bytesOf(a.content).byteLength > 0);
	const keys = files.map(() => `att/${crypto.randomUUID()}`);
	await Promise.all(files.map((a, i) => env.MAIL.put(keys[i], bytesOf(a.content), { httpMetadata: { contentType: a.mimeType || 'application/octet-stream' } })));
	if (files.length)
		await env.DB.batch(
			files.map((a, i) =>
				env.DB.prepare('INSERT INTO inbox_attachments (message_id, key, name, media_type, size, content_id, inline) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
					msg!.id,
					keys[i],
					cleanName(a.filename ?? (a.mimeType.startsWith('image/') ? 'image' : 'file')),
					a.mimeType || 'application/octet-stream',
					bytesOf(a.content).byteLength,
					(a.contentId ?? '').replace(/^<|>$/g, ''),
					a.contentId && (a.related || a.disposition === 'inline') ? 1 : 0
				)
			)
		);
	await run(env.DB, "UPDATE inbox_threads SET status = 'open', unread = 1, last_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", threadId);
	return threadId;
}

// ---------- the Inbox page ----------

export async function threadList(db: D1Database, status: 'open' | 'done') {
	const rows = await all<InboxThread>(
		db,
		`SELECT t.id, t.subject, t.status, t.unread, t.last_at,
			(SELECT CASE WHEN m.direction = 'out' THEN COALESCE(mb.name, 'Someone') || ' replied' ELSE COALESCE(NULLIF(m.from_name, ''), m.from_email) END
				FROM inbox_messages m LEFT JOIN members mb ON mb.id = m.sent_by WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS who,
			(SELECT substr(m.text, 1, 1500) FROM inbox_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS preview,
			(SELECT COUNT(*) FROM inbox_messages m WHERE m.thread_id = t.id) AS count,
			(SELECT COUNT(*) FROM inbox_attachments a JOIN inbox_messages m ON m.id = a.message_id WHERE m.thread_id = t.id AND a.inline = 0) AS files
		 FROM inbox_threads t WHERE t.status = ? ORDER BY t.last_at DESC, t.id DESC LIMIT 1000`,
		status
	);
	// The preview shows what they wrote, not the earlier emails quoted under it.
	return rows.map((t) => ({ ...t, preview: splitQuote(t.preview ?? '').text.replace(/\s+/g, ' ').trim().slice(0, 300) }));
}

/** True for a forward, whose quoted email is the point of it and stays unfolded. */
export const isForward = (subject: string) => /^\s*(fwd?|fw)\s*:/i.test(subject);

/**
 * An email's own words, and apart from them the earlier emails it quotes underneath ("On … wrote:",
 * Outlook's "From: … Sent: …" block, or trailing "> " lines), which the Inbox folds behind "•••" the
 * way Gmail and Outlook do. A forward, or an email that is all quote, keeps everything as its text.
 */
export function splitQuote(text: string): { text: string; quote: string } {
	const lines = text.split('\n');
	const at = (i: number) => lines[i]?.trim() ?? '';
	for (let i = 0; i < lines.length; i++) {
		const l = at(i);
		if (/forwarded message/i.test(l)) break;
		const wrote = /^On\b.{0,250}\bwrote:$/i.test(l) || (/^On\b/.test(l) && l.length < 250 && /\bwrote:$/i.test(at(i + 1)));
		const outlook =
			/^-{2,}\s*Original Message\s*-{2,}$/i.test(l) ||
			(/^_{8,}$/.test(l) && /^From:\s/i.test(at(i + 1))) ||
			(/^From:\s/i.test(l) && at(i - 1) === '' && [1, 2, 3, 4].some((k) => /^(Sent|Date):\s/i.test(at(i + k))));
		// Only a last block of "> " lines; answers written between quoted lines stay whole.
		const cited = l.startsWith('>') && lines.slice(i).every((x) => !x.trim() || x.trim().startsWith('>')) && !lines.slice(0, i).some((x) => x.trim().startsWith('>'));
		if (!wrote && !outlook && !cited) continue;
		const head = lines.slice(0, i).join('\n').trim();
		return head ? { text: head, quote: lines.slice(i).join('\n').trim() } : { text, quote: '' };
	}
	return { text, quote: '' };
}

export const unreadCount = async (db: D1Database) =>
	(await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM inbox_threads WHERE unread = 1 AND status = 'open'"))?.n ?? 0;

export const threadById = (db: D1Database, id: number) =>
	first<{ id: number; subject: string; status: 'open' | 'done'; unread: number; last_at: string }>(db, 'SELECT * FROM inbox_threads WHERE id = ?', id);

export async function threadMessages(db: D1Database, threadId: number) {
	const [messages, files] = await Promise.all([
		all<InboxMessage>(
			db,
			'SELECT m.*, mb.name AS sender FROM inbox_messages m LEFT JOIN members mb ON mb.id = m.sent_by WHERE m.thread_id = ? ORDER BY m.id',
			threadId
		),
		all<InboxAttachment>(
			db,
			'SELECT a.id, a.message_id, a.name, a.media_type, a.size, a.content_id, a.inline FROM inbox_attachments a JOIN inbox_messages m ON m.id = a.message_id WHERE m.thread_id = ? ORDER BY a.id',
			threadId
		)
	]);
	return messages.map((m) => ({ ...m, files: files.filter((f) => f.message_id === m.id) }));
}

export const attachmentById = (db: D1Database, id: number) =>
	first<InboxAttachment & { key: string; thread_id: number }>(
		db,
		'SELECT a.*, m.thread_id FROM inbox_attachments a JOIN inbox_messages m ON m.id = a.message_id WHERE a.id = ?',
		id
	);

/**
 * An email's HTML, ready for a sandboxed frame: no scripts or forms, links open in a new tab, and
 * the images it carries (cid:) point at their attachments. Pictures from the web still load.
 */
export function frameHtml(html: string, files: Pick<InboxAttachment, 'id' | 'content_id'>[]) {
	const byCid = new Map(files.filter((f) => f.content_id).map((f) => [f.content_id.toLowerCase(), f.id]));
	const body = html.replace(/cid:([^"'\s)>]+)/gi, (whole, cid: string) => {
		const id = byCid.get(decodeURIComponent(cid).toLowerCase());
		return id ? `/inbox/file/${id}` : whole;
	});
	const csp = "default-src 'none'; img-src 'self' https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:";
	// Standards mode, as Gmail and Outlook show email; dark from the first paint (the page turns the email's own colors dark once it loads).
	return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>:root{color-scheme:dark;background:#1c1916;color:#f6f1e6}body{margin:0;padding:12px 14px;font-family:system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${body}`;
}

// ---------- replying ----------

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A list of addresses typed into a field, or null if one isn't an address. */
export function addressList(input: string): string[] | null {
	const parts = input
		.split(/[,;\s]+/)
		.map((s) => s.trim().replace(/^.*<([^>]+)>$/, '$1').toLowerCase())
		.filter(Boolean);
	if (parts.some((p) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(p))) return null;
	return [...new Set(parts)].slice(0, 30);
}

/** Who a reply goes to by default: the newest outside sender (their Reply-To if they set one), with everyone else on it copied. */
export function replyTargets(messages: Pick<InboxMessage, 'direction' | 'from_email' | 'reply_to' | 'to_emails' | 'cc_emails'>[], ourDomain: string) {
	const ours = (e: string) => e.endsWith(`@${ourDomain}`);
	const last = [...messages].reverse().find((m) => m.direction === 'in') ?? messages[messages.length - 1];
	if (!last) return { to: '', cc: '' };
	const to = last.direction === 'in' ? (last.reply_to || last.from_email).split(', ').filter(Boolean) : last.to_emails.split(', ').filter(Boolean);
	const cc = [...last.to_emails.split(', '), ...last.cc_emails.split(', ')].filter((e) => e && !ours(e) && !to.includes(e));
	return { to: to.join(', '), cc: [...new Set(cc)].join(', ') };
}

const toBase64 = (bytes: ArrayBuffer) => {
	const u8 = new Uint8Array(bytes);
	let s = '';
	for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
	return btoa(s);
};

/** What sendMessage sends: a reply to one email in the thread, or that email forwarded. */
export type SendInput = {
	mode: 'reply' | 'forward';
	/** The email answered or forwarded; the newest one if it's gone. */
	of: number | null;
	to: string[];
	cc: string[];
	bcc: string[];
	text: string;
	files: { name: string; type: string; bytes: ArrayBuffer }[];
};

const list = (s: string) => s.split(', ').filter(Boolean);

/** Who wrote an email, the way a quote names them. */
const author = (env: Env, m: InboxMessage) =>
	m.direction === 'in' ? (m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email) : `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`;

/**
 * Sends a reply or a forward in this thread from the club address and keeps it in the thread, sent or
 * not. A reply quotes the email it answers and carries the headers that keep it threaded; a forward
 * carries that email's text and files.
 */
export async function sendMessage(env: Env, senderId: number | null, threadId: number, input: SendInput, zone: string) {
	const thread = await threadById(env.DB, threadId);
	if (!thread) return { ok: false, error: 'Thread not found.' };
	const messages = await threadMessages(env.DB, threadId);
	const of = messages.find((m) => m.id === input.of) ?? messages[messages.length - 1];
	const forward = input.mode === 'forward';
	const refs = of && !forward ? [...of.refs.split(' ').filter(Boolean), of.message_id].filter(Boolean).slice(-20) : [];
	const subject = forward
		? /^\s*(fwd?|fw)\s*:/i.test(thread.subject) ? thread.subject : `Fwd: ${thread.subject}`
		: /^\s*re\s*:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;

	// The email answered, quoted under the reply the way mail programs do; a forward carries it whole.
	let quoteText = '';
	let quoteHtml = '';
	let forwarded: { key: string; name: string; media_type: string; size: number }[] = [];
	if (of) {
		const when = new Date(of.created_at).toLocaleString('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' });
		const quoted = of.text.trim();
		if (forward) {
			const head = [`From: ${author(env, of)}`, `Date: ${when}`, `Subject: ${of.subject}`, `To: ${of.to_emails}`, ...(of.cc_emails ? [`Cc: ${of.cc_emails}`] : [])];
			quoteText = `\n\n---------- Forwarded message ---------\n${head.join('\n')}\n\n${quoted}`;
			quoteHtml = `<div style="margin-top:16px">---------- Forwarded message ---------<br>${head.map(escape).join('<br>')}<br><br>${escape(quoted).replace(/\n/g, '<br>')}</div>`;
			forwarded = await all(env.DB, 'SELECT key, name, media_type, size FROM inbox_attachments WHERE message_id = ? AND inline = 0 ORDER BY id', of.id);
		} else {
			quoteText = `\n\nOn ${when}, ${author(env, of)} wrote:\n${quoted.split('\n').map((l) => `> ${l}`).join('\n')}`;
			quoteHtml = `<p style="color:#666">On ${escape(when)}, ${escape(author(env, of))} wrote:</p><blockquote type="cite" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${escape(quoted).replace(/\n/g, '<br>')}</blockquote>`;
		}
	}
	if (forwarded.reduce((n, f) => n + f.size, 0) + input.files.reduce((n, f) => n + f.bytes.byteLength, 0) > REPLY_FILES_LIMIT)
		return { ok: false, error: 'The files together have to be under 18 MB.' };
	const carried = (await Promise.all(forwarded.map(async (f) => ({ ...f, bytes: await (await env.MAIL.get(f.key))?.arrayBuffer() })))).filter(
		(f): f is typeof f & { bytes: ArrayBuffer } => !!f.bytes
	);
	const bodyHtml = input.text
		.split(/\n{2,}/)
		.filter((p) => p.trim())
		.map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
		.join('');

	const [to, ...alsoTo] = input.to;
	const result = await sendMail(env, {
		to: { name: '', email: to },
		cc: [...alsoTo, ...input.cc].map((email) => ({ name: '', email })),
		bcc: input.bcc.map((email) => ({ name: '', email })),
		subject,
		text: input.text + quoteText,
		html: `<div style="font-family:system-ui,sans-serif">${bodyHtml}${quoteHtml}</div>`,
		kind: 'inbox',
		headers: {
			...(!forward && of?.message_id ? { 'In-Reply-To': `<${of.message_id}>` } : {}),
			...(refs.length ? { References: refs.map((r) => `<${r}>`).join(' ') } : {})
		},
		attachments: [
			...carried.map((f) => ({ filename: cleanName(f.name), content: toBase64(f.bytes), mimeType: f.media_type })),
			...input.files.map((f) => ({ filename: cleanName(f.name), content: toBase64(f.bytes), mimeType: f.type }))
		]
	});

	const row = await first<{ id: number }>(
		env.DB,
		`INSERT INTO inbox_messages (thread_id, direction, message_id, in_reply_to, refs, from_name, from_email, to_emails, cc_emails, bcc_emails, subject, text, sent_by, error)
		 VALUES (?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		threadId,
		// Cloudflare picks the Message-ID; their reply's In-Reply-To names it.
		result.messageId ?? '',
		!forward ? (of?.message_id ?? '') : '',
		refs.join(' '),
		env.MAIL_FROM_NAME,
		env.MAIL_FROM,
		input.to.join(', '),
		input.cc.join(', '),
		input.bcc.join(', '),
		subject,
		input.text + (forward ? quoteText : ''),
		senderId,
		result.ok ? '' : (result.error ?? 'Not sent.')
	);
	const keys = input.files.map(() => `att/${crypto.randomUUID()}`);
	await Promise.all(input.files.map((f, i) => env.MAIL.put(keys[i], f.bytes, { httpMetadata: { contentType: f.type } })));
	const kept = [
		// A forward's files are the same objects as the original's.
		...carried.map((f) => [f.key, f.name, f.media_type, f.size] as const),
		...input.files.map((f, i) => [keys[i], cleanName(f.name), f.type, f.bytes.byteLength] as const)
	];
	if (kept.length)
		await env.DB.batch(kept.map((k) => env.DB.prepare('INSERT INTO inbox_attachments (message_id, key, name, media_type, size) VALUES (?, ?, ?, ?, ?)').bind(row!.id, ...k)));
	if (result.ok) await run(env.DB, "UPDATE inbox_threads SET last_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), unread = 0 WHERE id = ?", threadId);
	return result;
}

// ---------- sending later ----------

export type InboxScheduled = {
	id: number;
	thread_id: number;
	mode: 'reply' | 'forward';
	of_message: number | null;
	to_emails: string;
	cc_emails: string;
	bcc_emails: string;
	text: string;
	files: string;
	send_at: string;
	created_by: number | null;
	sender?: string | null;
};

type WaitingFile = { key: string; name: string; type: string; size: number };

const waitingFiles = (s: Pick<InboxScheduled, 'files'>): WaitingFile[] => {
	try {
		return JSON.parse(s.files);
	} catch {
		return [];
	}
};

/** Keeps an email to send at sendAt (a UTC time in ms). Its files wait in MAIL under sched/. */
export async function scheduleMessage(env: Env, senderId: number, threadId: number, input: SendInput, sendAt: number) {
	const files: WaitingFile[] = input.files.map((f) => ({ key: `sched/${crypto.randomUUID()}`, name: cleanName(f.name), type: f.type, size: f.bytes.byteLength }));
	await Promise.all(input.files.map((f, i) => env.MAIL.put(files[i].key, f.bytes, { httpMetadata: { contentType: f.type } })));
	await run(
		env.DB,
		'INSERT INTO inbox_scheduled (thread_id, mode, of_message, to_emails, cc_emails, bcc_emails, text, files, send_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		threadId,
		input.mode,
		input.of,
		input.to.join(', '),
		input.cc.join(', '),
		input.bcc.join(', '),
		input.text,
		JSON.stringify(files),
		new Date(sendAt).toISOString(),
		senderId
	);
}

/** A thread's emails waiting to send, soonest first, with their files' names. */
export async function scheduledIn(db: D1Database, threadId: number) {
	const rows = await all<InboxScheduled>(
		db,
		'SELECT s.*, mb.name AS sender FROM inbox_scheduled s LEFT JOIN members mb ON mb.id = s.created_by WHERE s.thread_id = ? ORDER BY s.send_at, s.id',
		threadId
	);
	return rows.map(({ files, ...s }) => ({ ...s, files: waitingFiles({ files }).map((f) => ({ name: f.name, size: f.size })) }));
}

/** Cancels an email set to send later and lets go of its waiting files. */
export async function cancelScheduled(env: Env, threadId: number, id: number) {
	const row = await first<InboxScheduled>(env.DB, 'DELETE FROM inbox_scheduled WHERE id = ? AND thread_id = ? RETURNING *', id, threadId);
	if (row) await Promise.all(waitingFiles(row).map((f) => env.MAIL.delete(f.key)));
	return !!row;
}

/**
 * The cron's part: sends each email whose time has come, as the exec who set it. One that fails stays
 * in its thread with the reason, and the thread comes back to Open as unread.
 */
export async function sendDueScheduled(env: Env, now = new Date()) {
	const due = await all<InboxScheduled>(env.DB, 'SELECT * FROM inbox_scheduled WHERE send_at <= ? ORDER BY send_at LIMIT 20', now.toISOString());
	let sent = 0;
	let failed = 0;
	for (const s of due) {
		// Taken off the list first, so an overlapping run can't send it twice.
		if (!(await first(env.DB, 'DELETE FROM inbox_scheduled WHERE id = ? RETURNING id', s.id))) continue;
		const files = waitingFiles(s);
		const bodies = await Promise.all(files.map(async (f) => (await env.MAIL.get(f.key))?.arrayBuffer() ?? null));
		const input: SendInput = {
			mode: s.mode === 'forward' ? 'forward' : 'reply',
			of: s.of_message,
			to: list(s.to_emails),
			cc: list(s.cc_emails),
			bcc: list(s.bcc_emails),
			text: s.text,
			files: files.flatMap((f, i) => (bodies[i] ? [{ name: f.name, type: f.type, bytes: bodies[i] }] : []))
		};
		const result = await sendMessage(env, s.created_by, s.thread_id, input, env.TIMEZONE);
		if (result.ok) sent++;
		else {
			failed++;
			await run(env.DB, "UPDATE inbox_threads SET status = 'open', unread = 1 WHERE id = ?", s.thread_id);
		}
		await Promise.all(files.map((f) => env.MAIL.delete(f.key)));
	}
	return { sent, failed };
}
