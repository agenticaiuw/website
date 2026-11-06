import { WorkerMailer } from 'worker-mailer';
import { run } from './db';
import type { Env } from './types';

export type Recipient = { name: string; email: string };

export type Mail = {
	to: Recipient;
	cc?: Recipient[];
	subject: string;
	text: string;
	html: string;
	/** Shown in the email log: login, invite, assigned, reminder, digest, test. */
	kind: string;
};

export type SendResult = { ok: boolean; error?: string };

const smtp = (env: Env) => ({
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	credentials: { username: env.MAIL_FROM, password: env.SMTP_PASSWORD! },
	authType: 'plain' as const,
	socketTimeoutMs: 15_000,
	responseTimeoutMs: 15_000
});

const envelope = (env: Env, mail: Mail) => ({
	from: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
	to: mail.to,
	cc: mail.cc?.length ? mail.cc : undefined,
	reply: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
	subject: mail.subject,
	text: mail.text,
	html: mail.html
});

async function record(env: Env, mail: Mail, status: 'sent' | 'failed' | 'logged', error: string): Promise<SendResult> {
	const to = [mail.to, ...(mail.cc ?? [])].map((r) => r.email).join(', ');
	await run(env.DB, 'INSERT INTO email_log (to_email, subject, kind, status, error) VALUES (?, ?, ?, ?, ?)', to, mail.subject, mail.kind, status, error.slice(0, 500));
	if (status === 'failed') console.error(`[mail] failed to ${mail.to.email}: ${error}`);
	return status === 'failed' ? { ok: false, error } : { ok: true };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Without a password (or in DEV_MODE) nothing is sent; returns how to record the attempt instead. */
function unsendable(env: Env, mail: Mail): ['logged' | 'failed', string] | null {
	if (env.DEV_MODE) {
		console.log(`[mail] to ${mail.to.email}${mail.cc?.length ? ` cc ${mail.cc.map((r) => r.email).join(', ')}` : ''}: ${mail.subject}\n${mail.text}`);
		return ['logged', ''];
	}
	if (!env.SMTP_PASSWORD) return ['failed', 'SMTP_PASSWORD is not set, so the hub cannot send email yet.'];
	return null;
}

/**
 * Sends through the club's Google Workspace mailbox over SMTP, and records every attempt
 * in email_log. In DEV_MODE (or without a password) nothing leaves the machine.
 */
export async function sendMail(env: Env, mail: Mail): Promise<SendResult> {
	const skip = unsendable(env, mail);
	if (skip) return record(env, mail, ...skip);
	try {
		await WorkerMailer.send(smtp(env), envelope(env, mail));
		return record(env, mail, 'sent', '');
	} catch (e) {
		return record(env, mail, 'failed', message(e));
	}
}

const PER_CONNECTION = 20;

/** Sends many emails over a few reused connections instead of one connection each. */
export async function sendMails(env: Env, mails: Mail[]): Promise<SendResult[]> {
	const results: SendResult[] = [];
	let mailer: WorkerMailer | null = null;
	let used = 0;
	const close = async () => {
		await mailer?.close().catch(() => {});
		mailer = null;
	};
	for (const mail of mails) {
		const skip = unsendable(env, mail);
		if (skip) {
			results.push(await record(env, mail, ...skip));
			continue;
		}
		try {
			if (!mailer || used >= PER_CONNECTION) {
				await close();
				mailer = await WorkerMailer.connect(smtp(env));
				used = 0;
			}
			used++;
			await mailer.send(envelope(env, mail));
			results.push(await record(env, mail, 'sent', ''));
		} catch (e) {
			// Start the next one on a fresh connection in case this one is broken.
			await close();
			results.push(await record(env, mail, 'failed', message(e)));
		}
	}
	await close();
	return results;
}
