import { error, text } from '@sveltejs/kit';
import { knowledgeText } from '$lib/server/knowledge';
import type { RequestHandler } from './$types';

/**
 * The Handbook for Badger: every page as one Markdown text. Execs' questions also get the exec
 * pages (Badger sends exec=1 when the asker has an exec role). Signed with BADGER_TOKEN.
 */
export const GET: RequestHandler = async ({ url, request, locals: { env } }) => {
	if (!env.BADGER_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.BADGER_TOKEN}`) error(401, 'Not signed');
	const body = await knowledgeText(env.DB, url.searchParams.get('exec') === '1');
	return text(body || 'The Handbook is empty.', { headers: { 'Cache-Control': 'no-store' } });
};
