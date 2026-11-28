import { loadSite } from '$lib/server/site';
import { siteUrl } from '$lib/seo';

// Every page. lastmod is the build date: each build has the hub's latest text.
export const prerender = true;
export const trailingSlash = 'never';

export async function GET() {
	const lastmod = new Date().toISOString().slice(0, 10);
	const { work } = loadSite();
	const paths = ['/', '/hive/', '/teams/', ...work.subteams.items.map((t) => `/teams/${t.k}/`), '/events/', '/partners/', '/join/'];
	const urls = paths.map((p) => `\t<url>\n\t\t<loc>${siteUrl}${p}</loc>\n\t\t<lastmod>${lastmod}</lastmod>\n\t</url>`).join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
}
