import { loadSite } from '$lib/server/site';
import { ogPng } from '$lib/server/og';

// /og.png: the link-preview image, drawn at build time from the hub's text (src/lib/server/og.ts).
export const prerender = true;
export const trailingSlash = 'never';

export async function GET() {
	return new Response(new Uint8Array(await ogPng(loadSite())), { headers: { 'content-type': 'image/png' } });
}
