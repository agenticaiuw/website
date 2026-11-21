import { json } from '@sveltejs/kit';
import { endBearerSession } from '$lib/server/auth';

export async function POST(e) {
	await endBearerSession(e);
	return json({ ok: true });
}
