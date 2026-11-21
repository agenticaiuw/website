import { Hono } from 'hono';
import { formatTimestamp } from '../dates';
import { all, first } from '../db';
import { inviteEmail, testEmail } from '../emails';
import { type Mail, sendMail, sendMails } from '../mail';
import { id } from '../form';
import { isExec } from '../perm';
import { runDailyReminders, sendExecDigest } from '../reminders';
import type { AppEnv } from '../types';
import { page } from '../views/layout';
import { Empty, PageHead } from '../views/ui';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('/email/*', async (c, next) => (isExec(c.get('viewer')) ? next() : c.redirect('/?error=forbidden')));
adminRoutes.use('/email', async (c, next) => (isExec(c.get('viewer')) ? next() : c.redirect('/?error=forbidden')));

type LogRow = { id: number; to_email: string; subject: string; kind: string; status: string; error: string; created_at: string; html: string; bcc: string };

// Pressing "Send" twice, or again after a partial failure, only reaches people who haven't had one lately.
const INVITE_COOLDOWN_DAYS = 3;

type InviteRow = { id: number; name: string; email: string };

/** Everyone active who hasn't been sent an invite recently. */
function inviteList(db: D1Database, onlyId?: number) {
	const since = new Date(Date.now() - INVITE_COOLDOWN_DAYS * 86_400_000).toISOString();
	return all<InviteRow>(
		db,
		`SELECT id, name, email FROM members
		 WHERE active = 1 AND (?1 IS NULL OR id = ?1)
		   AND (?1 IS NOT NULL OR lower(email) NOT IN (SELECT lower(to_email) FROM email_log WHERE kind = 'invite' AND status != 'failed' AND created_at > ?2))
		 ORDER BY name COLLATE NOCASE`,
		onlyId ?? null,
		since
	);
}

adminRoutes.get('/email', async (c) => {
	// Sign-in code emails stay out of the history.
	const log = await all<LogRow>(c.env.DB, "SELECT id, to_email, subject, kind, status, error, created_at FROM email_log WHERE kind != 'login' ORDER BY id DESC LIMIT 150");
	const configured = !!c.env.SMTP_PASSWORD;
	return page(
		c,
		{ title: 'Email', active: 'email' },
		<>
			<PageHead title="Email history" sub={`Everything the hub has sent from ${c.env.MAIL_FROM}, newest first.`} />
			{c.env.DEV_MODE ? (
				<p class="callout">Local dev mode: emails are written to this log and the terminal, not sent.</p>
			) : (
				!configured && (
					<p class="flash err">
						Email isn't connected yet. Create a Google app password for {c.env.MAIL_FROM} and save it with <code>npx wrangler secret put SMTP_PASSWORD</code>. Until then, nothing is delivered.
					</p>
				)
			)}
			{log.length ? (
				<div class="table-wrap">
					<table class="table mail-log">
						<thead>
							<tr>
								<th>When</th>
								<th>To</th>
								<th>Type</th>
								<th>Subject</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{log.map((r) => (
								<tr>
									<td class="nowrap small">{formatTimestamp(r.created_at, c.env.TIMEZONE)}</td>
									<td class="small">{r.to_email}</td>
									<td class="small">{r.kind}</td>
									<td class="mail-subject">
										<a href={`/email/${r.id}`}>{r.subject}</a>
									</td>
									<td>
										<span class={`pill mail-${r.status}`} title={r.error || undefined}>
											{r.status}
										</span>
										{r.error && <div class="small bad">{r.error}</div>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<Empty>No emails yet.</Empty>
			)}
		</>
	);
});

/** Makes every link in a saved email open in a new tab. */
const withBase = (html: string) =>
	html.includes('<head>') ? html.replace('<head>', '<head><base target="_blank">') : html.replace('<html>', '<html><head><base target="_blank"></head>');

/** One email, shown the way the person got it. */
adminRoutes.get('/email/:id{[0-9]+}', async (c) => {
	const r = await first<LogRow>(c.env.DB, "SELECT * FROM email_log WHERE id = ? AND kind != 'login'", id(c.req.param('id')) ?? 0);
	if (!r) return c.notFound();
	const bcc = r.bcc ? r.bcc.split(', ') : [];
	return page(
		c,
		{ title: r.subject, active: 'email' },
		<>
			<PageHead eyebrow="Email" title={r.subject} sub={formatTimestamp(r.created_at, c.env.TIMEZONE)} actions={<a class="btn ghost" href="/email">Back</a>} />
			<dl class="facts card">
				<div class="wide">
					<dt>To</dt>
					<dd class="break">{bcc.length ? bcc.join(', ') : r.to_email}</dd>
				</div>
				<div>
					<dt>Type</dt>
					<dd>{r.kind}</dd>
				</div>
				<div>
					<dt>Status</dt>
					<dd>
						<span class={`pill mail-${r.status}`}>{r.status}</span>
						{r.error && <div class="small bad">{r.error}</div>}
					</dd>
				</div>
			</dl>
			{r.html ? (
				// No scripts run inside; links open in a new tab.
				<iframe class="email-preview" title={r.subject} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc={withBase(r.html)} />
			) : (
				<Empty>Sent before the hub kept copies of emails, so only the subject was saved.</Empty>
			)}
		</>
	);
});

adminRoutes.post('/email/run', async (c) => {
	await runDailyReminders(c.env);
	return c.redirect('/email?ok=reminders');
});

adminRoutes.post('/email/digest', async (c) => {
	await sendExecDigest(c.env);
	return c.redirect('/email?ok=digest');
});

// ?member=ID shows what someone else will get.
adminRoutes.get('/email/invite/preview', async (c) => {
	const [member] = await inviteList(c.env.DB, id(c.req.query('member')) ?? c.get('viewer').id);
	if (!member) return c.notFound();
	return c.html(inviteEmail(member, c.env.APP_URL).html);
});

adminRoutes.post('/email/invite', async (c) => {
	const mails: Mail[] = (await inviteList(c.env.DB)).map((member) => ({
		to: { name: member.name, email: member.email },
		kind: 'invite',
		...inviteEmail(member, c.env.APP_URL)
	}));
	await sendMails(c.env, mails);
	return c.redirect('/email?ok=invited');
});

adminRoutes.post('/email/test', async (c) => {
	const v = c.get('viewer');
	await sendMail(c.env, { to: { name: v.name, email: v.email }, kind: 'test', ...testEmail(v.name, c.env.APP_URL) });
	return c.redirect('/email?ok=test');
});
