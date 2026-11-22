import { error } from '@sveltejs/kit';
import { loadSite } from '$lib/server/site';
import { ogPng } from '$lib/server/og';
import { ogCards } from '$lib/seo';
import type { EntryGenerator, RequestHandler } from './$types';

// /og/<page>.png: each page's link-preview image, drawn at build time from the hub's text (src/lib/server/og.ts).
export const prerender = true;
export const trailingSlash = 'never';

export const entries: EntryGenerator = () => Object.keys(ogCards(loadSite())).map((page) => ({ page }));

export const GET: RequestHandler = async ({ params }) => {
	const site = loadSite();
	const card = ogCards(site)[params.page];
	if (!card) error(404, 'Not found');
	return new Response(new Uint8Array(await ogPng(site, card)), { headers: { 'content-type': 'image/png' } });
};
