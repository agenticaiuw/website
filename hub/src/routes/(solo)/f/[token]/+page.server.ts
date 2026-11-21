import { error, redirect } from '@sveltejs/kit';
import { sessionMember } from '$lib/server/auth';
import { first, meetingById, memberByEmail, nowIso } from '$lib/server/db';
import { isEmail, readForm, str } from '$lib/server/form';
import { questionsOf, RATINGS } from '$lib/meetings';
import type { Env, Form } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

async function openForm(env: Env, token: string) {
	const f = await first<Form>(env.DB, 'SELECT * FROM forms WHERE token = ?', token);
	const m = f && (await meetingById(env.DB, f.meeting_id));
	if (!f || !m) error(404, 'Form not found');
	return { f, m };
}

// The form people fill out at a meeting, from its link or QR code. Anyone with the link can open it.
export const load: PageServerLoad = async (event) => {
	const { f, m } = await openForm(event.locals.env, event.params.token);
	// Signed-in members don't have to type who they are.
	const me = f.closed ? null : await sessionMember(event);
	return {
		title: f.title,
		token: f.token,
		formTitle: f.title,
		closed: !!f.closed,
		meeting: { title: m.title, date: m.date },
		questions: questionsOf(f),
		me: me && { name: me.name, email: me.email },
		error: !!event.url.searchParams.get('error')
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals: { env } }) => {
		const { f, m } = await openForm(env, params.token);
		if (f.closed) redirect(303, `/f/${f.token}`);
		const form = await readForm(request);
		const name = str(form.name, 100);
		const email = str(form.email, 200).toLowerCase();
		if (!name || !isEmail(email)) redirect(303, `/f/${f.token}?error=missing`);
		const answers: Record<string, string> = {};
		for (const q of questionsOf(f)) {
			const value = str(form[`a_${q.id}`], 2000);
			if (q.kind === 'rating' ? RATINGS.includes(value) : value) answers[q.id] = value;
		}
		const member = await memberByEmail(env.DB, email);
		const memberId = member?.active ? member.id : null;
		const db = env.DB;
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
		return { title: 'Thanks', thanks: name.split(' ')[0] };
	}
};
