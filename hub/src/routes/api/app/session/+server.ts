import { json } from '@sveltejs/kit';
import { body, memberJson } from '$lib/server/app-api';
import { newSessionToken, useLoginCode } from '$lib/server/auth';
import { str } from '$lib/server/form';

export async function POST({ request, locals }) {
	const b = await body(request);
	const email = str(b.email, 200).toLowerCase();
	const member = await useLoginCode(locals.env, email, str(b.code, 20).replace(/\s/g, ''));
	if (!member) return json({ error: 'That code is wrong or has expired. Check your latest email, or send a new code.' }, { status: 401 });
	const { token, expires } = await newSessionToken(locals.env, member.id);
	return json({ token, expires_at: expires.toISOString(), member: memberJson(member) });
}
