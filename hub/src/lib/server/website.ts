import { getMeta, setMeta } from './db';
import { hubTeams, siteContent, withHubTeams } from './site/store';
import type { Env } from '$lib/types';

/** The GitHub Action that builds the public website with this text and deploys it (.github/workflows/website.yml). */
const WORKFLOW = 'https://api.github.com/repos/agenticaiuw/website/actions/workflows/website.yml/dispatches';

/** What the website is built from: the newest version of each section, teams with their people from the hub. */
export async function siteFeed(db: D1Database) {
	const [content, teams] = await Promise.all([siteContent(db), hubTeams(db)]);
	// Teams come with their head and leads from the hub's own teams, so they are never typed twice.
	content.sections.teams = withHubTeams(content.sections.teams, teams);
	return content;
}

async function sha256(s: string) {
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
	return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The website is plain files built with the hub's text, so it needs a rebuild whenever that text
 * changes. This starts one when the text differs from what the last rebuild was started for.
 * Runs after every form post and on every cron run. Without GITHUB_DISPATCH_TOKEN it does nothing.
 */
export async function rebuildWebsite(env: Env) {
	if (!env.GITHUB_DISPATCH_TOKEN) return;
	const digest = await sha256(JSON.stringify((await siteFeed(env.DB)).sections));
	if ((await getMeta(env.DB, 'website_rebuilt_for')) === digest) return;
	const res = await fetch(WORKFLOW, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
			accept: 'application/vnd.github+json',
			'user-agent': 'agenticaiuw-hub',
			'x-github-api-version': '2022-11-28'
		},
		body: JSON.stringify({ ref: 'main' })
	});
	if (!res.ok) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
	await setMeta(env.DB, 'website_rebuilt_for', digest);
	console.log('[website] rebuild started');
}

/** Logs instead of throwing: a failed rebuild is retried on the next cron run. */
export const rebuildWebsiteQuietly = (env: Env) => rebuildWebsite(env).catch((err) => console.error('[website]', err instanceof Error ? err.message : err));
