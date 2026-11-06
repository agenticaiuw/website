import { Hono } from 'hono';
import type { Context } from 'hono';
import { renderSVG } from 'uqr';
import { sessionMember } from '../auth';
import { formatDate, formatTimestamp } from '../dates';
import { all, first, meetingById, memberByEmail, nowIso, run } from '../db';
import { id, isEmail, list, readForm, str } from '../form';
import { canEditMeeting } from '../perm';
import type { AppEnv, Form, FormQuestion, FormResponse, MeetingRow } from '../types';
import { Document, page, plainPage } from '../views/layout';
import { Empty, Field, PageHead } from '../views/ui';

// Forms people fill out at a meeting, from a link or a QR code on the screen. The form itself
// is public (publicFormRoutes, mounted before sign-in); setting it up and the results are not.

export const publicFormRoutes = new Hono<AppEnv>();
export const formRoutes = new Hono<AppEnv>();

const MAX_QUESTIONS = 20;
const RATINGS = ['1', '2', '3', '4', '5'];

export const questionsOf = (f: Pick<Form, 'questions'>): FormQuestion[] => JSON.parse(f.questions);
export const formUrl = (appUrl: string, f: Pick<Form, 'token'>) => `${appUrl}/f/${f.token}`;
const bare = (url: string) => url.replace(/^https?:\/\//, '');

/** 8 characters with nothing that reads two ways (no 0/o, 1/l), so it can be typed off the screen. */
function shortToken() {
	const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
	return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]).join('');
}

export type FormWithCount = Form & { responses: number };

export function formForMeeting(db: D1Database, meetingId: number) {
	return first<FormWithCount>(db, 'SELECT f.*, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = f.id) AS responses FROM forms f WHERE f.meeting_id = ?', meetingId);
}

/** The form box on the meeting page. Everyone who can see the meeting gets the link; editors get the rest. */
export function FormSection({ m, f, editable, appUrl }: { m: MeetingRow; f: FormWithCount | null; editable: boolean; appUrl: string }) {
	const base = `/meetings/${m.id}/form`;
	if (!f) {
		if (!editable) return null;
		return (
			<>
				<h2 class="section-title" id="form">
					Form
				</h2>
				<p class="hint">
					Feedback or anything else people fill out from a QR code, no sign-in needed. You can put a live count on the screen. <a href={base}>Add a form</a>
				</p>
			</>
		);
	}
	const url = formUrl(appUrl, f);
	return (
		<>
			<h2 class="section-title" id="form">
				{f.title} <span class="count">{f.responses}</span>
			</h2>
			<div class="card form-box">
				{f.closed ? (
					<p class="hint">Closed. It isn't taking responses.</p>
				) : (
					<p>
						<a href={url}>{bare(url)}</a>
					</p>
				)}
				{editable && (
					<div class="form-actions">
						<a class="btn primary" href={`${base}/screen`}>
							Show on screen
						</a>
						<a class="btn" href={`${base}/responses`}>
							Responses
						</a>
						<a class="btn ghost" href={base}>
							Edit
						</a>
					</div>
				)}
			</div>
		</>
	);
}

// ---------- setting it up (signed in) ----------

async function editableMeeting(c: Context<AppEnv>) {
	const meetingId = id(c.req.param('id'));
	const m = meetingId ? await meetingById(c.env.DB, meetingId) : null;
	return m && canEditMeeting(c.get('viewer'), m) ? m : null;
}

formRoutes.get('/meetings/:id/form', async (c) => {
	const m = await editableMeeting(c);
	if (!m) return c.notFound();
	const f = await formForMeeting(c.env.DB, m.id);
	// The saved questions plus one blank row to add another.
	const rows: FormQuestion[] = [...(f ? questionsOf(f) : []), { id: '', label: '', kind: 'text' }];
	return page(
		c,
		{ title: f ? `Edit: ${f.title}` : 'New form', active: 'meetings' },
		<>
			<PageHead
				eyebrow={`Form · ${m.title}`}
				title={f ? f.title : 'New form'}
				sub="People open it from a link or QR code without signing in. They give their name and email, and anyone on the roster is checked off as there."
			/>
			<form method="post" action={`/meetings/${m.id}/form`} class="card form-grid">
				<Field label="Title" wide>
					<input name="title" required maxlength={100} value={f?.title ?? 'Feedback'} />
				</Field>
				<div class="field wide">
					<span class="label">Questions</span>
					<div class="action-rows" data-rows>
						{rows.map((q) => (
							<div class="question-row" data-row>
								<input type="hidden" name="qid" value={q.id} />
								<input name="qlabel" value={q.label} maxlength={300} placeholder="Question" aria-label="Question" />
								<select name="qkind" aria-label="Answer">
									<option value="">Written answer</option>
									<option value="rating" selected={q.kind === 'rating'}>
										Rating 1–5
									</option>
								</select>
							</div>
						))}
					</div>
					<span class="hint">Name and email are always asked. Clear a question to remove it.</span>
				</div>
				<div class="wide">
					<button type="button" class="btn ghost" data-add-row>
						+ Another question
					</button>
				</div>
				{f && (
					<label class="check wide">
						<input type="checkbox" name="closed" value="1" checked={!!f.closed} />
						Closed: stop taking responses
					</label>
				)}
				<div class="form-actions wide">
					<button class="btn primary">Save</button>
					<a class="btn ghost" href={`/meetings/${m.id}`}>
						Cancel
					</a>
					{f && (
						<>
							<span class="spacer"></span>
							<button class="btn danger" formaction={`/meetings/${m.id}/form/delete`} data-confirm={`Delete this form and its ${f.responses} ${f.responses === 1 ? 'response' : 'responses'}?`}>
								Delete form
							</button>
						</>
					)}
				</div>
			</form>
		</>
	);
});

formRoutes.post('/meetings/:id/form', async (c) => {
	const v = c.get('viewer');
	const m = await editableMeeting(c);
	if (!m) return c.notFound();
	const form = await readForm(c);
	const title = str(form.title, 100);
	if (!title) return c.redirect(`/meetings/${m.id}/form?error=missing`);
	const ids = list(form.qid);
	const kinds = list(form.qkind);
	// Saved questions keep their ids so earlier answers stay with them. New ones get a fresh random
	// id, never a removed question's, so old answers can't land under a different question.
	const questions: FormQuestion[] = list(form.qlabel)
		.map((label, i) => ({ id: /^q[a-z0-9]+$/.test(ids[i] ?? '') ? ids[i] : `q${shortToken()}`, label: label.trim().slice(0, 300), kind: kinds[i] === 'rating' ? ('rating' as const) : ('text' as const) }))
		.filter((q) => q.label)
		.slice(0, MAX_QUESTIONS);
	const existing = await formForMeeting(c.env.DB, m.id);
	if (existing) {
		await run(c.env.DB, 'UPDATE forms SET title = ?, questions = ?, closed = ? WHERE id = ?', title, JSON.stringify(questions), str(form.closed) === '1' ? 1 : 0, existing.id);
	} else {
		await run(c.env.DB, 'INSERT INTO forms (meeting_id, token, title, questions, created_by) VALUES (?, ?, ?, ?, ?)', m.id, shortToken(), title, JSON.stringify(questions), v.id);
	}
	return c.redirect(`/meetings/${m.id}?ok=saved#form`);
});

formRoutes.post('/meetings/:id/form/delete', async (c) => {
	const m = await editableMeeting(c);
	if (!m) return c.notFound();
	await run(c.env.DB, 'DELETE FROM forms WHERE meeting_id = ?', m.id);
	return c.redirect(`/meetings/${m.id}?ok=deleted`);
});

/** For the projector: the QR code and a count that updates itself. */
formRoutes.get('/meetings/:id/form/screen', async (c) => {
	const m = await editableMeeting(c);
	const f = m && (await formForMeeting(c.env.DB, m.id));
	if (!m || !f) return c.notFound();
	const url = formUrl(c.env.APP_URL, f);
	return c.html(
		'<!doctype html>' +
			(
				<Document title={`${f.title} · ${m.title}`}>
					<main class="screen">
						<div class="screen-qr" dangerouslySetInnerHTML={{ __html: renderSVG(url, { ecc: 'M', border: 2 }) }} />
						<div class="screen-info">
							<p class="eyebrow">{m.title}</p>
							<h1>{f.title}</h1>
							<p class="screen-url">{bare(url)}</p>
							<p class="screen-count">
								<span data-live-count={`/meetings/${m.id}/form/count`}>{f.responses}</span>
								<span data-live-of></span>
							</p>
							<p class="screen-label">filled out{f.closed ? ' · closed' : ''}</p>
							<p class="screen-tools js-only">
								<label>
									People here <input type="number" min="0" max="999" inputmode="numeric" data-live-total={String(f.id)} />
								</label>
								<a href={`/meetings/${m.id}#form`}>Back to the meeting</a>
							</p>
						</div>
					</main>
				</Document>
			)
	);
});

formRoutes.get('/meetings/:id/form/count', async (c) => {
	const m = await editableMeeting(c);
	const f = m && (await formForMeeting(c.env.DB, m.id));
	if (!f) return c.json({ error: 'not found' }, 404);
	return c.json({ count: f.responses });
});

async function responsesFor(c: Context<AppEnv>) {
	const m = await editableMeeting(c);
	const f = m && (await formForMeeting(c.env.DB, m.id));
	if (!m || !f) return null;
	const rows = await all<FormResponse>(c.env.DB, 'SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at', f.id);
	return { m, f, questions: questionsOf(f), rows: rows.map((r) => ({ ...r, a: JSON.parse(r.answers) as Record<string, string> })) };
}

formRoutes.get('/meetings/:id/form/responses', async (c) => {
	const data = await responsesFor(c);
	if (!data) return c.notFound();
	const { m, f, questions, rows } = data;
	const ratings = questions
		.filter((q) => q.kind === 'rating')
		.map((q) => {
			const values = rows.map((r) => Number(r.a[q.id])).filter((n) => n >= 1 && n <= 5);
			return { q, n: values.length, avg: values.length ? values.reduce((s, x) => s + x, 0) / values.length : 0 };
		});
	return page(
		c,
		{ title: `${f.title}: responses`, active: 'meetings' },
		<>
			<PageHead
				eyebrow={`Form · ${m.title}`}
				title={`${f.title}: ${rows.length} ${rows.length === 1 ? 'response' : 'responses'}`}
				actions={
					<>
						<a class="btn" href={`/meetings/${m.id}/form/responses.csv`}>
							Download CSV
						</a>
						<a class="btn" href={`/meetings/${m.id}/form/screen`}>
							Show on screen
						</a>
					</>
				}
			/>
			{ratings.length > 0 && rows.length > 0 && (
				<dl class="facts card">
					{ratings.map((r) => (
						<div>
							<dt>{r.q.label}</dt>
							<dd>{r.n ? `${r.avg.toFixed(1)} / 5 from ${r.n}` : 'No ratings'}</dd>
						</div>
					))}
				</dl>
			)}
			{rows.length ? (
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								{questions.map((q) => (
									<th>{q.label}</th>
								))}
								<th>Sent</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr>
									<td class="nowrap">{r.name}</td>
									<td>{r.email}</td>
									{questions.map((q) => (
										<td class="answer">{r.a[q.id] ?? <span class="muted">—</span>}</td>
									))}
									<td class="nowrap muted">{formatTimestamp(r.updated_at, c.env.TIMEZONE)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<Empty>No responses yet.</Empty>
			)}
		</>
	);
});

formRoutes.get('/meetings/:id/form/responses.csv', async (c) => {
	const data = await responsesFor(c);
	if (!data) return c.notFound();
	const { m, f, questions, rows } = data;
	// Quote every cell, and keep spreadsheet apps from running an answer that starts like a formula.
	const cell = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
	const lines = [
		['Name', 'Email', ...questions.map((q) => q.label), 'Sent'],
		...rows.map((r) => [r.name, r.email, ...questions.map((q) => r.a[q.id] ?? ''), r.updated_at])
	].map((cells) => cells.map(cell).join(','));
	const filename = `${m.date} ${m.title} ${f.title}`.replace(/[^\w -]+/g, '').trim() + '.csv';
	return c.body(lines.join('\r\n') + '\r\n', 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
});

// ---------- filling it out (public) ----------

async function openForm(c: Context<AppEnv>) {
	const f = await first<Form>(c.env.DB, 'SELECT * FROM forms WHERE token = ?', c.req.param('token') ?? '');
	const m = f && (await meetingById(c.env.DB, f.meeting_id));
	return f && m ? { f, m } : null;
}

const notFound = (
	<>
		<h1>This form doesn't exist</h1>
		<p class="sub">Check the link, or ask whoever shared it.</p>
	</>
);

publicFormRoutes.get('/f/:token', async (c) => {
	const found = await openForm(c);
	if (!found) return plainPage(c, 'Form not found', notFound, 404);
	const { f, m } = found;
	const head = (
		<>
			<p class="eyebrow">
				{m.title} · {formatDate(m.date)}
			</p>
			<h1>{f.title}</h1>
		</>
	);
	if (f.closed) {
		return plainPage(
			c,
			f.title,
			<>
				{head}
				<p class="sub">This form is closed.</p>
			</>
		);
	}
	// Signed-in members don't have to type who they are.
	const me = await sessionMember(c);
	return plainPage(
		c,
		f.title,
		<>
			{head}
			{c.req.query('error') && (
				<p class="flash err" role="alert">
					Fill in your name and a valid email.
				</p>
			)}
			<form method="post" action={`/f/${f.token}`} class="stack">
				<Field label="Name">
					<input name="name" required maxlength={100} autocomplete="name" value={me?.name ?? ''} />
				</Field>
				<Field label="Email">
					<input type="email" name="email" required maxlength={200} autocomplete="email" placeholder="you@wisc.edu" value={me?.email ?? ''} />
				</Field>
				{questionsOf(f).map((q) =>
					q.kind === 'rating' ? (
						<div class="field" role="radiogroup" aria-label={q.label}>
							<span class="label">{q.label}</span>
							<div class="seg full rating">
								{RATINGS.map((n) => (
									<label>
										<input type="radio" name={`a_${q.id}`} value={n} />
										<span>{n}</span>
									</label>
								))}
							</div>
						</div>
					) : (
						<Field label={q.label}>
							<textarea name={`a_${q.id}`} rows={3} maxlength={2000}></textarea>
						</Field>
					)
				)}
				<button class="btn primary">Send</button>
			</form>
		</>
	);
});

publicFormRoutes.post('/f/:token', async (c) => {
	const found = await openForm(c);
	if (!found) return plainPage(c, 'Form not found', notFound, 404);
	const { f, m } = found;
	if (f.closed) return c.redirect(`/f/${f.token}`);
	const form = await readForm(c);
	const name = str(form.name, 100);
	const email = str(form.email, 200).toLowerCase();
	if (!name || !isEmail(email)) return c.redirect(`/f/${f.token}?error=missing`);
	const answers: Record<string, string> = {};
	for (const q of questionsOf(f)) {
		const value = str(form[`a_${q.id}`], 2000);
		if (q.kind === 'rating' ? RATINGS.includes(value) : value) answers[q.id] = value;
	}
	const member = await memberByEmail(c.env.DB, email);
	const memberId = member?.active ? member.id : null;
	const db = c.env.DB;
	await db.batch([
		db
			.prepare(
				`INSERT INTO form_responses (form_id, name, email, member_id, answers) VALUES (?1, ?2, ?3, ?4, ?5)
				 ON CONFLICT (form_id, email) DO UPDATE SET name = ?2, member_id = ?4, answers = ?5, updated_at = ?6`
			)
			.bind(f.id, name, email, memberId, JSON.stringify(answers), nowIso()),
		// Filling it out counts as being there. Leaves anything already marked alone.
		...(memberId ? [db.prepare("INSERT OR IGNORE INTO attendance (meeting_id, member_id, status) VALUES (?, ?, 'present')").bind(m.id, memberId)] : [])
	]);
	return plainPage(
		c,
		'Thanks',
		<>
			<h1>Thanks, {name.split(' ')[0]}</h1>
			<p class="sub">Your response is in. To change it, fill out the form again with the same email.</p>
			<a class="btn" href={`/f/${f.token}`}>
				Back to the form
			</a>
		</>
	);
});
