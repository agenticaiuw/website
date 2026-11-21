import { error, redirect } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { list, readForm, str } from '$lib/server/form';
import { editableMeeting, formForMeeting, shortToken } from '$lib/server/meetings';
import type { FormQuestion } from '$lib/types';
import type { RequestHandler } from './$types';

const MAX_QUESTIONS = 20;

// Forms people fill out at a meeting, from a link or a QR code on the screen. The form itself is
// public (/f/[token]); setting it up and the results are not.

export const GET: RequestHandler = async ({ params, locals: { env, viewer } }) => {
	const m = await editableMeeting(env, viewer, params.id);
	if (!m) error(404, 'Not found');
	redirect(303, `/meetings/${m.id}?view=form`);
};

export const POST: RequestHandler = async ({ params, request, locals: { env, viewer: v } }) => {
	const m = await editableMeeting(env, v, params.id);
	if (!m) error(404, 'Not found');
	const form = await readForm(request);
	const title = str(form.title, 100);
	if (!title) redirect(303, `/meetings/${m.id}?view=form&error=missing#form`);
	const ids = list(form.qid);
	const kinds = list(form.qkind);
	// Saved questions keep their ids so earlier answers stay with them. New ones get a fresh random
	// id, never a removed question's, so old answers can't land under a different question.
	const questions: FormQuestion[] = list(form.qlabel)
		.map((label, i) => ({ id: /^q[a-z0-9]+$/.test(ids[i] ?? '') ? ids[i] : `q${shortToken()}`, label: label.trim().slice(0, 300), kind: kinds[i] === 'rating' ? ('rating' as const) : ('text' as const) }))
		.filter((q) => q.label)
		.slice(0, MAX_QUESTIONS);
	const existing = await formForMeeting(env.DB, m.id);
	if (existing) {
		await run(env.DB, 'UPDATE forms SET title = ?, questions = ?, closed = ? WHERE id = ?', title, JSON.stringify(questions), str(form.closed) === '1' ? 1 : 0, existing.id);
	} else {
		await run(env.DB, 'INSERT INTO forms (meeting_id, token, title, questions, created_by) VALUES (?, ?, ?, ?, ?)', m.id, shortToken(), title, JSON.stringify(questions), v.id);
	}
	redirect(303, `/meetings/${m.id}?view=form&ok=saved#form`);
};
