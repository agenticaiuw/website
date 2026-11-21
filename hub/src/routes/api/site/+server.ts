import { json } from '@sveltejs/kit';
import { siteFeed } from '$lib/server/website';
import type { RequestHandler } from './$types';

/** The website's text, read when the website is built. No sign-in, no personal data. */
export const GET: RequestHandler = async ({ locals: { env } }) => json(await siteFeed(env.DB), { headers: { 'Access-Control-Allow-Origin': '*' } });
