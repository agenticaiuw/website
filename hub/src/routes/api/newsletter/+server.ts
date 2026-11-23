import { json } from '@sveltejs/kit';
import { todayIn } from '$lib/dates';
import { first, run } from '$lib/server/db';
import { isEmail, str } from '$lib/server/form';
import type { RequestHandler } from './$types';

/** The public website, the only page that posts here. */
const WEBSITE = ['https://agenticaiuw.com', 'https://www.agenticaiuw.com'];
const SOURCE = 'Website signup';

const allowed = (origin: string | null, dev: boolean) => !!origin && (WEBSITE.includes(origin) || (dev && /^http:\/\/localhost:\d+$/.test(origin)));

const cors = (origin: string | null, dev: boolean): Record<string, string> =>
	allowed(origin, dev) ? { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' } : {};

export const OPTIONS: RequestHandler = ({ request, locals: { env } }) =>
	new Response(null, {
		status: 204,
		headers: { ...cors(request.headers.get('Origin'), !!env.DEV_MODE), 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '86400' }
	});

/**
 * The website's newsletter signup. Adds the email to the newsletter list (the only list the
 * newsletter and the Google Group come from), or notes the signup on the person already there.
 * Always answers the same way for a new or known email, so the form can't be used to check who's on it.
 */
export const POST: RequestHandler = async ({ request, locals: { env } }) => {
	const origin = request.headers.get('Origin');
	const headers = cors(origin, !!env.DEV_MODE);
	if (!allowed(origin, !!env.DEV_MODE)) return json({ ok: false }, { status: 403, headers });

	const form = await request.formData().catch(() => null);
	const email = str(form?.get('email'), 254).trim().toLowerCase();
	// A hidden field people never see; bots that fill every field get a quiet yes.
	if (str(form?.get('website'), 200)) return json({ ok: true }, { headers });
	if (!isEmail(email)) return json({ ok: false, error: 'email' }, { status: 400, headers });

	const recent = await first<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM newsletter WHERE sources LIKE ? AND created_at >= ?`, `%${SOURCE}%`, new Date(Date.now() - 10 * 60_000).toISOString());
	if ((recent?.n ?? 0) >= 30) return json({ ok: false, error: 'busy' }, { status: 429, headers });

	const today = todayIn(env.TIMEZONE);
	const source = `${SOURCE} ${today}`;
	await run(
		env.DB,
		`INSERT INTO newsletter (email, sources, first_seen) VALUES (?1, ?2, ?3)
		 ON CONFLICT(email) DO UPDATE SET sources = CASE
			WHEN instr(newsletter.sources, ?4) > 0 THEN newsletter.sources
			WHEN newsletter.sources = '' THEN excluded.sources
			ELSE newsletter.sources || '; ' || excluded.sources END`,
		email,
		source,
		today,
		SOURCE
	);
	return json({ ok: true }, { headers });
};
