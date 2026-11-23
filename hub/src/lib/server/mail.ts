// Every hub email goes out through Cloudflare Email Sending (the EMAIL binding), from MAIL_FROM.
import { run } from './db.ts';
import type { Env } from '../types.ts';

export type Recipient = { name: string; email: string };

export type Mail = {
	to: Recipient;
	cc?: Recipient[];
	/** Hidden recipients, for one email to a whole list. Sent in batches when there are many. */
	bcc?: Recipient[];
	subject: string;
	text: string;
	html: string;
	/** Shown in the email log: login, invite, assigned, reminder, digest, test, inbox. */
	kind: string;
	/** Extra headers Cloudflare allows, like In-Reply-To and References on an inbox reply. It sets Message-ID itself. */
	headers?: Record<string, string>;
	/** Files, their content base64. */
	attachments?: { filename: string; content: string; mimeType: string }[];
};

/** messageId: the Message-ID Cloudflare gave the (first) email, without brackets. */
export type SendResult = { ok: boolean; error?: string; messageId?: string };

/** Cloudflare takes at most 50 addresses per email, to, cc and bcc together. */
export const MAX_RECIPIENTS = 50;

/** One email per batch of hidden recipients, each with the same to and cc. */
export function batches(mail: Mail): Mail[] {
	const bcc = mail.bcc ?? [];
	const room = MAX_RECIPIENTS - 1 - (mail.cc?.length ?? 0);
	if (bcc.length <= room) return [mail];
	const out: Mail[] = [];
	for (let i = 0; i < bcc.length; i += room) out.push({ ...mail, bcc: bcc.slice(i, i + room) });
	return out;
}

// Cloudflare wants a name with every address object; a plain string is an address with no name.
const address = (r: Recipient) => (r.name ? { name: r.name, email: r.email } : r.email);

const message = (env: Env, mail: Mail) => ({
	from: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
	to: address(mail.to),
	cc: mail.cc?.length ? mail.cc.map(address) : undefined,
	bcc: mail.bcc?.length ? mail.bcc.map(address) : undefined,
	replyTo: env.MAIL_FROM,
	subject: mail.subject,
	text: mail.text,
	html: mail.html,
	headers: mail.headers && Object.keys(mail.headers).length ? mail.headers : undefined,
	attachments: mail.attachments?.length
		? mail.attachments.map((a) => ({ content: a.content, filename: a.filename, type: a.mimeType, disposition: 'attachment' as const }))
		: undefined
});

async function record(env: Env, mail: Mail, status: 'sent' | 'failed' | 'logged', error: string, messageId?: string): Promise<SendResult> {
	const bcc = mail.bcc?.length ? ` (bcc ${mail.bcc.length} ${mail.bcc.length === 1 ? 'person' : 'people'})` : '';
	const to = [mail.to, ...(mail.cc ?? [])].map((r) => r.email).join(', ') + bcc;
	// Sign-in emails hold a code, so their contents are never kept.
	await run(
		env.DB,
		'INSERT INTO email_log (to_email, subject, kind, status, error, html, bcc) VALUES (?, ?, ?, ?, ?, ?, ?)',
		to,
		mail.subject,
		mail.kind,
		status,
		error.slice(0, 500),
		mail.kind === 'login' ? '' : mail.html,
		(mail.bcc ?? []).map((r) => r.email).join(', ')
	);
	if (status === 'failed') console.error(`[mail] failed to ${mail.to.email}: ${error}`);
	return status === 'failed' ? { ok: false, error } : { ok: true, messageId };
}

const reason = (e: unknown) => {
	const code = (e as { code?: string })?.code;
	const text = e instanceof Error ? e.message : String(e);
	return code ? `${code}: ${text}` : text;
};

/** In DEV_MODE (or without the binding) nothing is sent; returns how to record the attempt instead. */
function unsendable(env: Env, mail: Mail): ['logged' | 'failed', string] | null {
	if (env.DEV_MODE) {
		console.log(
			`[mail] to ${mail.to.email}${mail.cc?.length ? ` cc ${mail.cc.map((r) => r.email).join(', ')}` : ''}${mail.bcc?.length ? ` bcc ${mail.bcc.map((r) => r.email).join(', ')}` : ''}: ${mail.subject}\n${
				mail.headers ? Object.entries(mail.headers).map(([k, v]) => `${k}: ${v}\n`).join('') : ''
			}${mail.text}`
		);
		return ['logged', ''];
	}
	if (!env.EMAIL) return ['failed', 'The EMAIL sending binding is missing, so the hub cannot send email.'];
	return null;
}

/** Sends one email (in batches if its hidden list is long) and records it in email_log. */
export async function sendMail(env: Env, mail: Mail): Promise<SendResult> {
	const skip = unsendable(env, mail);
	if (skip) return record(env, mail, ...skip, `dev-${crypto.randomUUID()}@${env.MAIL_FROM.split('@')[1]}`);
	let messageId: string | undefined;
	const errors: string[] = [];
	for (const part of batches(mail)) {
		try {
			const sent = await env.EMAIL!.send(message(env, part));
			messageId ??= sent.messageId.replace(/^<|>$/g, '');
		} catch (e) {
			errors.push(reason(e));
		}
	}
	if (!errors.length) return record(env, mail, 'sent', '', messageId);
	const parts = batches(mail).length;
	return record(env, mail, 'failed', parts > 1 ? `${errors.length} of ${parts} batches failed: ${errors[0]}` : errors[0]);
}

/** Sends many emails, one after another. */
export async function sendMails(env: Env, mails: Mail[]): Promise<SendResult[]> {
	const results: SendResult[] = [];
	for (const mail of mails) results.push(await sendMail(env, mail));
	return results;
}
