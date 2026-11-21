import { json } from '@sveltejs/kit';
import { hubTeams, siteContent, withHubTeams } from '$lib/server/site/store';
import type { RequestHandler } from './$types';

/** Read by the public website on every page view. No sign-in, no personal data. */
export const GET: RequestHandler = async ({ locals: { env } }) => {
	const [content, teams] = await Promise.all([siteContent(env.DB), hubTeams(env.DB)]);
	// Teams come with their head and leads from the hub's own teams, so they are never typed twice.
	content.sections.teams = withHubTeams(content.sections.teams, teams);
	return json(content, { headers: { 'Access-Control-Allow-Origin': '*' } });
};
