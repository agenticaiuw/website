// The club's shared inbox. Cloudflare Email Routing hands every email for the domain to the Worker's
// email handler (src/worker.ts), which calls receiveEmail. The raw message and its attachments go to
// R2 (MAIL); D1 keeps what the Inbox page shows. Execs reply from the hub, through the same Gmail
// address every other hub email comes from (Cloudflare Email Sending), with the headers that keep the conversation threaded.
import PostalMime, { type Address, type Attachment } from 'postal-mime';
import { all, first, run } from './db.ts';
import { sendMail } from './mail.ts';
import type { Env, Viewer } from '../types.ts';

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

export const threadList = (db: D1Database, status: 'open' | 'done') =>
	all<InboxThread>(
		db,
		`SELECT t.id, t.subject, t.status, t.unread, t.last_at,
			(SELECT CASE WHEN m.direction = 'out' THEN COALESCE(mb.name, 'Someone') || ' replied' ELSE COALESCE(NULLIF(m.from_name, ''), m.from_email) END
				FROM inbox_messages m LEFT JOIN members mb ON mb.id = m.sent_by WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS who,
			(SELECT substr(m.text, 1, 400) FROM inbox_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS preview,
			(SELECT COUNT(*) FROM inbox_messages m WHERE m.thread_id = t.id) AS count
		 FROM inbox_threads t WHERE t.status = ? ORDER BY t.last_at DESC LIMIT 200`,
		status
	);

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
	return `<meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:12px 14px;font-family:system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${body}`;
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

export type ReplyInput = { to: string[]; cc: string[]; text: string; files: { name: string; type: string; bytes: ArrayBuffer }[] };

/** Sends a reply in this thread from the club address and keeps it in the thread, sent or not. */
export async function sendReply(env: Env, viewer: Viewer, threadId: number, input: ReplyInput, zone: string) {
	const thread = await threadById(env.DB, threadId);
	if (!thread) return { ok: false, error: 'Thread not found.' };
	const messages = await threadMessages(env.DB, threadId);
	const last = messages[messages.length - 1];
	const refs = last ? [...last.refs.split(' ').filter(Boolean), last.message_id].filter(Boolean).slice(-20) : [];
	const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;

	// The newest email, quoted under the reply the way mail programs do.
	let quoteText = '';
	let quoteHtml = '';
	if (last) {
		const who = last.direction === 'in' ? (last.from_name ? `${last.from_name} <${last.from_email}>` : last.from_email) : env.MAIL_FROM_NAME;
		const when = new Date(last.created_at).toLocaleString('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' });
		const quoted = last.text.trim();
		quoteText = `\n\nOn ${when}, ${who} wrote:\n${quoted.split('\n').map((l) => `> ${l}`).join('\n')}`;
		quoteHtml = `<p style="color:#666">On ${escape(when)}, ${escape(who)} wrote:</p><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${escape(quoted).replace(/\n/g, '<br>')}</blockquote>`;
	}
	const bodyHtml = input.text
		.split(/\n{2,}/)
		.map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
		.join('');

	const [to, ...alsoTo] = input.to;
	const result = await sendMail(env, {
		to: { name: '', email: to },
		cc: [...alsoTo, ...input.cc].map((email) => ({ name: '', email })),
		subject,
		text: input.text + quoteText,
		html: `<div style="font-family:system-ui,sans-serif">${bodyHtml}${quoteHtml}</div>`,
		kind: 'inbox',
		headers: {
			...(last?.message_id ? { 'In-Reply-To': `<${last.message_id}>` } : {}),
			...(refs.length ? { References: refs.map((r) => `<${r}>`).join(' ') } : {})
		},
		attachments: input.files.map((f) => ({ filename: cleanName(f.name), content: toBase64(f.bytes), mimeType: f.type }))
	});

	const row = await first<{ id: number }>(
		env.DB,
		`INSERT INTO inbox_messages (thread_id, direction, message_id, in_reply_to, refs, from_name, from_email, to_emails, cc_emails, subject, text, sent_by, error)
		 VALUES (?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		threadId,
		// Cloudflare picks the Message-ID; their reply's In-Reply-To names it.
		result.messageId ?? '',
		last?.message_id ?? '',
		refs.join(' '),
		env.MAIL_FROM_NAME,
		env.MAIL_FROM,
		input.to.join(', '),
		input.cc.join(', '),
		subject,
		input.text,
		viewer.id,
		result.ok ? '' : (result.error ?? 'Not sent.')
	);
	if (input.files.length) {
		const keys = input.files.map(() => `att/${crypto.randomUUID()}`);
		await Promise.all(input.files.map((f, i) => env.MAIL.put(keys[i], f.bytes, { httpMetadata: { contentType: f.type } })));
		await env.DB.batch(
			input.files.map((f, i) =>
				env.DB.prepare('INSERT INTO inbox_attachments (message_id, key, name, media_type, size) VALUES (?, ?, ?, ?, ?)').bind(row!.id, keys[i], cleanName(f.name), f.type, f.bytes.byteLength)
			)
		);
	}
	if (result.ok) await run(env.DB, "UPDATE inbox_threads SET last_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), unread = 0 WHERE id = ?", threadId);
	return result;
}
