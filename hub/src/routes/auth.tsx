import { Hono } from 'hono';
import { createLoginCode, endSession, memberForLogin, safeRedirect, sessionMember, shareSession, startSession, useLoginCode, verifyDoneLink } from '../auth';
import { formatDate } from '../dates';
import { setTaskStatus, taskById } from '../db';
import { loginEmail } from '../emails';
import { isEmail, readForm, str } from '../form';
import { sendMail } from '../mail';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { plainPage } from '../views/layout';

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/login', async (c) => {
	if (await sessionMember(c)) {
		await shareSession(c);
		return c.redirect(safeRedirect(c.req.query('next')));
	}
	return plainPage(
		c,
		'Sign in',
		<>
			<h1>Sign in</h1>
			<p class="sub">For Agentic AI UW execs and project members. We'll email you a 6-digit code; no password needed.</p>
			<form method="post" action="/login" class="stack">
				<input type="hidden" name="next" value={safeRedirect(c.req.query('next'))} />
				<label class="field">
					<span class="label">Email</span>
					<input type="email" name="email" required autocomplete="email" autofocus placeholder="you@wisc.edu" />
				</label>
				<button class="btn primary">Email me a code</button>
			</form>
			<p class="hint">Not on the roster yet? Ask an exec to add you.</p>
		</>
	);
});

// The same page whether or not the address is on the roster, so it can't be used to check who is.
function codePage(c: Context<AppEnv>, email: string, next: string, notice: { error?: string; devCode?: string | null } = {}) {
	return plainPage(
		c,
		'Enter your code',
		<>
			<h1>Check your email</h1>
			<p class="sub">
				If <strong>{email || 'that address'}</strong> is on the club roster, a 6-digit code is on its way from {c.env.MAIL_FROM}. It expires in 10 minutes.
			</p>
			{notice.error && <p class="flash err">{notice.error}</p>}
			{notice.devCode && (
				<p class="flash ok">
					Local dev mode: your code is <strong>{notice.devCode}</strong>
				</p>
			)}
			<form method="post" action="/verify" class="stack">
				<input type="hidden" name="email" value={email} />
				<input type="hidden" name="next" value={next} />
				<label class="field">
					<span class="label">Code</span>
					<input
						name="code"
						class="code-input"
						required
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9 ]{6,7}"
						maxlength={7}
						autofocus
						placeholder="123456"
					/>
				</label>
				<button class="btn primary">Sign in</button>
			</form>
			<div class="hint">
				<form method="post" action="/login" class="inline">
					<input type="hidden" name="email" value={email} />
					<input type="hidden" name="next" value={next} />
					<button class="link-btn">Send a new code</button>
				</form>
				{' · '}
				<a href={`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`}>Use a different email</a>
			</div>
		</>,
		notice.error ? 400 : 200
	);
}

authRoutes.post('/login', async (c) => {
	const form = await readForm(c);
	const email = str(form.email, 200).toLowerCase();
	const next = safeRedirect(str(form.next));
	let devCode: string | null = null;
	if (isEmail(email)) {
		const member = await memberForLogin(c.env, email);
		const code = member && (await createLoginCode(c.env, member));
		if (member && code) {
			await sendMail(c.env, { to: { name: member.name, email: member.email }, kind: 'login', ...loginEmail(member.name, code, c.env.APP_URL) });
			if (c.env.DEV_MODE) devCode = code;
		}
	}
	return codePage(c, email, next, { devCode });
});

authRoutes.post('/verify', async (c) => {
	const form = await readForm(c);
	const email = str(form.email, 200).toLowerCase();
	const next = safeRedirect(str(form.next));
	const member = await useLoginCode(c.env, email, str(form.code, 20).replace(/\s/g, ''));
	if (!member) return codePage(c, email, next, { error: 'That code is wrong or has expired. Check your latest email, or send a new code.' });
	await startSession(c, member.id);
	return c.redirect(next);
});

authRoutes.post('/logout', async (c) => {
	await endSession(c);
	return c.redirect('/login');
});

// ---------- "Mark done" straight from a reminder email ----------

async function doneLinkTask(c: { env: AppEnv['Bindings'] }, token: string) {
	const claim = await verifyDoneLink(c.env, token);
	if (!claim) return null;
	const task = await taskById(c.env.DB, claim.taskId);
	return task && task.assignee_id === claim.memberId ? task : null;
}

const badLink = (
	<>
		<h1>This link no longer works</h1>
		<p class="sub">It may have expired, or the task was reassigned. Sign in to update it instead.</p>
		<a class="btn primary" href="/">
			Open the hub
		</a>
	</>
);

authRoutes.get('/done', async (c) => {
	const token = c.req.query('t') ?? '';
	const task = await doneLinkTask(c, token);
	if (!task) return plainPage(c, 'Link expired', badLink, 400);
	if (task.status !== 'open') {
		return plainPage(
			c,
			'Already closed',
			<>
				<h1>Already {task.status === 'done' ? 'done' : 'closed'}</h1>
				<p class="sub">“{task.title}” needs nothing more from you.</p>
				<a class="btn" href={`/tasks/${task.id}`}>
					View task
				</a>
			</>
		);
	}
	return plainPage(
		c,
		'Mark done',
		<>
			<p class="eyebrow">Due {formatDate(task.due_date)}</p>
			<h1>{task.title}</h1>
			<p class="sub">Mark this done? Reminders for it will stop.</p>
			<form method="post" action="/done" class="stack">
				<input type="hidden" name="t" value={token} />
				<label class="field">
					<span class="label">Note (optional)</span>
					<textarea name="note" rows={3} placeholder="Link to the PR, doc or result"></textarea>
				</label>
				<button class="btn primary">Mark done</button>
			</form>
		</>
	);
});

authRoutes.post('/done', async (c) => {
	const form = await readForm(c);
	const task = await doneLinkTask(c, str(form.t));
	if (!task) return plainPage(c, 'Link expired', badLink, 400);
	if (task.status === 'open') {
		const note = str(form.note, 2000);
		await setTaskStatus(c.env.DB, task.id, 'done', task.assignee_id, note ? `From email: ${note}` : 'From email');
	}
	return plainPage(
		c,
		'Done',
		<>
			<h1>Nice work</h1>
			<p class="sub">“{task.title}” is marked done.</p>
			<a class="btn" href="/">
				Open the hub
			</a>
		</>
	);
});
