import { Hono } from 'hono';
import { formatDate, formatTimestamp } from '../dates';
import { all, getMeta } from '../db';
import { inviteEmail, testEmail } from '../emails';
import { type Mail, sendMail, sendMails } from '../mail';
import { id } from '../form';
import { isExec } from '../perm';
import { DAILY_OVERDUE_FOR, ESCALATE_AFTER, runDailyReminders, sendExecDigest, SOON_DAYS } from '../reminders';
import type { AppEnv } from '../types';
import { page } from '../views/layout';
import { Empty, PageHead, PostButton } from '../views/ui';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('/email/*', async (c, next) => (isExec(c.get('viewer')) ? next() : c.redirect('/?error=forbidden')));
adminRoutes.use('/email', async (c, next) => (isExec(c.get('viewer')) ? next() : c.redirect('/?error=forbidden')));

type LogRow = { id: number; to_email: string; subject: string; kind: string; status: string; error: string; created_at: string };

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
	const [log, lastDigest, uninvited] = await Promise.all([
		all<LogRow>(c.env.DB, 'SELECT * FROM email_log ORDER BY id DESC LIMIT 150'),
		getMeta(c.env.DB, 'last_digest_on'),
		inviteList(c.env.DB)
	]);
	const configured = !!c.env.SMTP_PASSWORD;
	return page(
		c,
		{ title: 'Email', active: 'email' },
		<>
			<PageHead title="Email and reminders" sub={`Everything is sent from ${c.env.MAIL_FROM}.`} />
			{c.env.DEV_MODE ? (
				<p class="callout">Local dev mode: emails are written to this log and the terminal, not sent.</p>
			) : (
				!configured && (
					<p class="flash err">
						Email isn't connected yet. Create a Google app password for {c.env.MAIL_FROM} and save it with <code>npx wrangler secret put SMTP_PASSWORD</code>. Until then, nothing is delivered.
					</p>
				)
			)}
			<div class="grid-2">
				<section class="card prose">
					<h3>When people get emails</h3>
					<ul>
						<li>
							<b>When assigned:</b> right away, one email per person listing what they were given.
						</li>
						<li>
							<b>Coming up:</b> once, {SOON_DAYS} days before the due date.
						</li>
						<li>
							<b>Due today:</b> the morning it's due.
						</li>
						<li>
							<b>Overdue:</b> every morning for the first {DAILY_OVERDUE_FOR} days, then every 3 days until it's done or dropped.
						</li>
						<li>
							<b>Escalation:</b> at {ESCALATE_AFTER} days overdue, whoever assigned it gets one email.
						</li>
						<li>
							<b>Exec digest:</b> Monday mornings, to every exec. Last sent: {lastDigest ? formatDate(lastDigest) : 'never'}.
						</li>
						<li>
							<b>Meetings:</b> 9 AM the day of, to the team. If it starts before noon, 6 PM the evening before. Club events go to everyone at 9 AM the day before.
						</li>
					</ul>
					<p>Task reminders go out at 9 AM Central and combine everything for a person into one email. Each has a one-click “Mark done” button.</p>
				</section>
				<section class="card stack">
					<h3 class="section-title">Run now</h3>
					<p class="hint">Safe to press more than once: nobody gets the same reminder twice in a day.</p>
					<PostButton action="/email/run" label="Send today’s reminders now" cls="btn primary" />
					<PostButton action="/email/digest" label="Send the exec digest now" cls="btn" />
					<PostButton action="/email/test" label="Send me a test email" cls="btn ghost" />
					<h3 class="section-title">Sign-in invite</h3>
					<p class="hint">
						Lets each person know they're on the hub and how to sign in. Anyone sent one in the last {INVITE_COOLDOWN_DAYS} days is skipped.{' '}
						<a href="/email/invite/preview" target="_blank">
							Preview yours
						</a>
					</p>
					{uninvited.length ? (
						<PostButton
							action="/email/invite"
							label={`Send to ${uninvited.length} ${uninvited.length === 1 ? 'person' : 'people'}`}
							cls="btn"
							confirm={`Email a sign-in invite to ${uninvited.length} ${uninvited.length === 1 ? 'person' : 'people'}?`}
						/>
					) : (
						<p class="hint">Everyone on the roster has one.</p>
					)}
				</section>
			</div>
			<h2 class="section-title">Log</h2>
			{log.length ? (
				<div class="table-wrap">
					<table class="table">
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
									<td>{r.subject}</td>
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
